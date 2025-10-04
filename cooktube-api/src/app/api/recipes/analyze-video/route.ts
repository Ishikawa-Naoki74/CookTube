import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { VideoProcessor } from '@/lib/video-processor';
import { FrameAnalyzer } from '@/lib/frame-analyzer';
import { TimelineIntegrator } from '@/lib/timeline-integrator';
import { TranscriptionService } from '@/lib/transcription';
import { BedrockService } from '@/lib/bedrock';
import { promises as fs } from 'fs';
import { z } from 'zod';

const analyzeVideoSchema = z.object({
  youtubeUrl: z.string().url(),
  options: z.object({
    frameInterval: z.number().min(1).max(10).optional(),
    maxFrames: z.number().min(10).max(500).optional(),
    enableTranscription: z.boolean().optional(),
    enableCustomLabels: z.boolean().optional()
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = analyzeVideoSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { youtubeUrl, options = {} } = validation.data;

    // 重複チェック: 同じユーザーが同じ動画を既に保存しているか確認
    const existingRecipe = await prisma.recipe.findFirst({
      where: {
        userId: session.user.id,
        youtubeUrl: youtubeUrl
      }
    });

    if (existingRecipe) {
      return NextResponse.json(
        { 
          error: 'Duplicate video',
          message: 'You have already saved this recipe. Each user can only save the same video once.',
          existingRecipeId: existingRecipe.id
        },
        { status: 409 } // Conflict
      );
    }

    // 同じ動画が現在処理中かチェック
    const processingJob = await prisma.processingJob.findFirst({
      where: {
        userId: session.user.id,
        youtubeUrl: youtubeUrl,
        status: {
          notIn: ['completed', 'failed']
        }
      }
    });

    if (processingJob) {
      return NextResponse.json(
        { 
          error: 'Processing in progress',
          message: 'This video is already being processed. Please wait for it to complete.',
          jobId: processingJob.id,
          status: processingJob.status,
          progress: processingJob.progressPercent
        },
        { status: 409 }
      );
    }

    // 処理ジョブを作成
    const job = await prisma.processingJob.create({
      data: {
        userId: session.user.id,
        youtubeUrl,
        status: 'pending',
        progressPercent: 0
      }
    });

    // 非同期で処理を開始
    processVideoAsync(job.id, youtubeUrl, options, session.user.id);

    return NextResponse.json({
      jobId: job.id,
      status: 'processing',
      message: 'Video analysis started'
    });
  } catch (error) {
    console.error('Error starting video analysis:', error);
    return NextResponse.json(
      { error: 'Failed to start video analysis' },
      { status: 500 }
    );
  }
}

async function processVideoAsync(
  jobId: string,
  youtubeUrl: string,
  options: any,
  userId: string
) {
  try {
    // ジョブステータスを更新
    await updateJobStatus(jobId, 'extracting_frames', 10);

    // 1. 動画からフレームを抽出
    const videoProcessor = new VideoProcessor({
      frameInterval: options.frameInterval || 2,
      maxFrames: options.maxFrames || 150
    });

    const frameExtractionResult = await videoProcessor.processYouTubeVideo(youtubeUrl);
    await updateJobStatus(jobId, 'analyzing_frames', 30);

    // 2. 各フレームを分析
    const frameAnalyzer = new FrameAnalyzer({
      customLabelsProjectArn: options.enableCustomLabels ? process.env.CUSTOM_LABELS_ARN : undefined
    });

    const frameAnalysisResults = [];
    const batchSize = 10;
    
    for (let i = 0; i < frameExtractionResult.frames.length; i += batchSize) {
      const batch = frameExtractionResult.frames.slice(i, i + batchSize);
      const imageBuffers = await Promise.all(
        batch.map(async (frame) => {
          // S3から画像を取得（実際の実装では S3 SDK を使用）
          const response = await fetch(frame.s3Url);
          return Buffer.from(await response.arrayBuffer());
        })
      );

      const batchResults = await frameAnalyzer.analyzeBatch(batch, imageBuffers);
      frameAnalysisResults.push(...batchResults);

      const progress = 30 + Math.floor((i / frameExtractionResult.frames.length) * 30);
      await updateJobStatus(jobId, 'analyzing_frames', progress);
    }

    // 3. 音声を文字起こし（オプション）
    let transcription = '';
    if (options.enableTranscription) {
      await updateJobStatus(jobId, 'transcribing', 60);
      const transcriptionService = new TranscriptionService();
      transcription = await transcriptionService.transcribeYouTubeVideo(youtubeUrl);
    }

    // 4. 時系列で統合
    await updateJobStatus(jobId, 'integrating_timeline', 70);
    const timelineIntegrator = new TimelineIntegrator();
    const integratedData = timelineIntegrator.integrate(frameAnalysisResults);

    // 5. AIでレシピを生成
    await updateJobStatus(jobId, 'generating_recipe', 80);
    const bedrockService = new BedrockService();
    
    // 統合データからプロンプトを作成
    const recipePrompt = buildRecipePrompt(
      integratedData,
      frameExtractionResult.videoMetadata,
      transcription
    );

    const generatedRecipe = await bedrockService.generateRecipe(recipePrompt);

    // 6. レシピを保存
    await updateJobStatus(jobId, 'saving_recipe', 90);
    
    const recipe = await prisma.recipe.create({
      data: {
        userId,
        youtubeUrl,
        videoTitle: frameExtractionResult.videoMetadata.title || 'Untitled Recipe',
        videoThumbnail: frameExtractionResult.videoMetadata.thumbnail || '',
        ingredients: generatedRecipe.ingredients,
        steps: generatedRecipe.steps,
        transcriptionText: transcription,
        recognitionLabels: frameAnalysisResults.map(f => ({
          timestamp: f.timestamp,
          ingredients: f.detectedIngredients.map(i => i.name),
          tools: f.detectedTools.map(t => t.name),
          actions: f.detectedActions.map(a => a.action)
        })),
        metadata: {
          totalFrames: frameExtractionResult.totalFrames,
          videoDuration: frameExtractionResult.videoMetadata.duration,
          cookingPhases: integratedData.cookingPhases,
          confidenceScores: calculateOverallConfidence(frameAnalysisResults)
        }
      }
    });

    // 7. フレーム分析結果を保存
    for (const frameResult of frameAnalysisResults) {
      await prisma.frameAnalysis.create({
        data: {
          jobId,
          frameNumber: frameResult.frameNumber,
          timestampSeconds: frameResult.timestamp,
          s3Url: frameExtractionResult.frames.find(f => f.frameNumber === frameResult.frameNumber)?.s3Url || '',
          detectedIngredients: frameResult.detectedIngredients,
          detectedTools: frameResult.detectedTools,
          detectedActions: frameResult.detectedActions,
          confidenceScores: frameResult.confidenceScores
        }
      });
    }

    // 完了
    await updateJobStatus(jobId, 'completed', 100, recipe.id);

  } catch (error) {
    console.error('Error processing video:', error);
    await updateJobStatus(jobId, 'failed', 0, undefined, error.message);
  }
}

async function updateJobStatus(
  jobId: string,
  status: string,
  progress: number,
  recipeId?: string,
  errorMessage?: string
) {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status,
      progressPercent: progress,
      recipeId,
      errorMessage,
      completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined
    }
  });
}

function buildRecipePrompt(
  integratedData: any,
  videoMetadata: any,
  transcription: string
): string {
  const ingredientsList = Array.from(integratedData.allIngredients.values())
    .map((i: any) => `${i.name} (${i.estimatedAmount || 'amount to be determined'})`);

  const steps = integratedData.timeline.map((segment: any, index: number) => ({
    step: index + 1,
    action: segment.mainAction,
    description: segment.description,
    duration: `${Math.round(segment.endTime - segment.startTime)} seconds`,
    ingredients: segment.ingredients,
    tools: segment.tools
  }));

  return `
Based on the following cooking video analysis, generate a complete recipe:

Video Title: ${videoMetadata.title || 'Cooking Video'}
Video Duration: ${Math.round(videoMetadata.duration)} seconds

Detected Ingredients:
${ingredientsList.join('\n')}

Detected Cooking Tools:
${Array.from(integratedData.allTools).join(', ')}

Cooking Timeline:
${JSON.stringify(steps, null, 2)}

Cooking Phases:
${JSON.stringify(integratedData.cookingPhases, null, 2)}

${transcription ? `Audio Transcription:\n${transcription}\n` : ''}

Please generate a structured recipe with:
1. A clear recipe title
2. Serving size
3. Prep and cook time
4. Complete ingredient list with precise measurements
5. Step-by-step instructions with clear descriptions
6. Tips and variations

Format the response as a JSON object with the following structure:
{
  "title": "Recipe Name",
  "servings": "4",
  "prepTime": "15 minutes",
  "cookTime": "30 minutes",
  "ingredients": [
    {
      "name": "ingredient name",
      "amount": "2",
      "unit": "cups",
      "notes": "optional notes"
    }
  ],
  "steps": [
    {
      "stepNumber": 1,
      "title": "Step Title",
      "description": "Detailed step description",
      "duration": "5 minutes",
      "tips": "Optional tips"
    }
  ],
  "tips": ["General cooking tips"],
  "tags": ["cuisine type", "meal type", etc.]
}
`;
}

function calculateOverallConfidence(frameResults: any[]): number {
  if (frameResults.length === 0) return 0;
  
  const totalConfidence = frameResults.reduce((sum, frame) => {
    return sum + frame.confidenceScores.overall;
  }, 0);
  
  return totalConfidence / frameResults.length;
}

// ジョブステータス取得エンドポイント
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const job = await prisma.processingJob.findUnique({
      where: { id: jobId },
      include: {
        recipe: true
      }
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progressPercent,
      recipeId: job.recipeId,
      recipe: job.recipe,
      error: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    );
  }
}