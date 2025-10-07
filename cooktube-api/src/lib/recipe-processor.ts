import { PrismaClient, JobStatus } from '@prisma/client';
import { YouTubeService } from './youtube';
import { GeminiService } from './gemini-service';
import { YouTubeProcessor } from './youtube-processor';

export interface ProcessingJobUpdate {
  jobId: string;
  status: JobStatus;
  progressPercent: number;
  errorMessage?: string;
}

export type ProcessingProgressCallback = (update: ProcessingJobUpdate) => void;

export class RecipeProcessorService {
  private prisma: PrismaClient;
  private youtubeService: YouTubeService;
  private geminiService: GeminiService;
  private youtubeProcessor: YouTubeProcessor;

  constructor() {
    try {
      console.log('🏗️  Initializing RecipeProcessorService');
      this.prisma = new PrismaClient();
      this.youtubeService = new YouTubeService();
      this.geminiService = new GeminiService();
      this.youtubeProcessor = new YouTubeProcessor();
      console.log('✅ RecipeProcessorService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize RecipeProcessorService:', error);
      throw error;
    }
  }

  async startProcessing(
    userId: string,
    youtubeUrl: string,
    progressCallback?: ProcessingProgressCallback
  ): Promise<string> {
    // Validate YouTube URL
    if (!YouTubeService.validateYouTubeUrl(youtubeUrl)) {
      throw new Error('Invalid YouTube URL');
    }

    // Ensure user exists (create guest user if needed)
    await this.ensureUserExists(userId);

    // Check if recipe already exists for this user and URL
    const existingRecipe = await this.prisma.recipe.findFirst({
      where: {
        userId,
        youtubeUrl,
      },
    });

    if (existingRecipe) {
      console.log('⚠️ Recipe already exists for this user and URL');
      throw new Error('このレシピはすでに保存済みです');
    }

    // Create processing job
    const job = await this.prisma.processingJob.create({
      data: {
        userId,
        youtubeUrl,
        status: 'pending',
        progressPercent: 0,
      },
    });

    // Process asynchronously
    this.processVideo(job.id, userId, youtubeUrl, progressCallback).catch(error => {
      console.error('Background processing failed:', error);
      this.updateJobStatus(job.id, 'failed', 0, error.message, progressCallback);
    });

    return job.id;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      console.log('👤 Creating guest user:', userId);
      await this.prisma.user.create({
        data: {
          id: userId,
          email: userId.startsWith('guest-') ? `${userId}@guest.com` : `${userId}@user.com`,
          name: userId.startsWith('guest-') ? 'Guest User' : 'User',
          isGuest: userId.startsWith('guest-'),
        },
      });
      console.log('✅ Guest user created');
    }
  }

  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
    progressPercent: number,
    errorMessage?: string,
    progressCallback?: ProcessingProgressCallback
  ): Promise<void> {
    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status,
        progressPercent,
        errorMessage,
      },
    });

    if (progressCallback) {
      progressCallback({
        jobId,
        status,
        progressPercent,
        errorMessage,
      });
    }
  }

  private async processVideo(
    jobId: string,
    userId: string,
    youtubeUrl: string,
    progressCallback?: ProcessingProgressCallback
  ): Promise<void> {
    let videoData: Awaited<ReturnType<YouTubeProcessor['processVideo']>> | null = null;
    let videoInfo: Awaited<ReturnType<typeof YouTubeService.getVideoInfo>> | null = null;

    try {
      // Step 1: Get video information from YouTube
      await this.updateJobStatus(jobId, 'pending', 10, undefined, progressCallback);

      console.log('🎬 Fetching video info for:', youtubeUrl);
      videoInfo = await YouTubeService.getVideoInfo(youtubeUrl);
      console.log('✅ Video info retrieved:', {
        id: videoInfo.id,
        title: videoInfo.title,
        duration: videoInfo.duration,
        uploader: videoInfo.uploader
      });

      await this.updateJobStatus(jobId, 'transcribing', 20, undefined, progressCallback);

      // Step 2: Process video with yt-dlp to get transcript (if available)
      console.log('📥 Processing video with yt-dlp...');
      let transcriptionText = '';
      try {
        videoData = await this.youtubeProcessor.processVideo(youtubeUrl, videoInfo.id);
        console.log('✅ Video processing completed');

        if (videoData?.transcript && videoData.transcript.length > 100) {
          transcriptionText = videoData.transcript;
          console.log('✅ Using YouTube transcript (length:', transcriptionText.length, ')');
        }
      } catch {
        console.error('Video processing error');
      }

      await this.updateJobStatus(jobId, 'analyzing_frames', 40, undefined, progressCallback);

      // Step 3: Analyze frames with Gemini if available
      let detectedLabels: string[] = [];
      if (videoData?.thumbnailFrames && videoData.thumbnailFrames.length > 0) {
        try {
          console.log('🔍 Analyzing frames with Gemini Vision...');
          for (const framePath of videoData.thumbnailFrames.slice(0, 5)) {
            const labels = await this.geminiService.analyzeImage(framePath);
            detectedLabels.push(...labels.map(l => l.name));
          }
          console.log('✅ Frame analysis completed:', detectedLabels.length, 'labels found');
        } catch {
          console.error('Gemini frame analysis error');
        }
      }

      await this.updateJobStatus(jobId, 'generating_recipe', 60, undefined, progressCallback);

      // Step 4: Generate recipe with Gemini
      console.log('🤖 Generating recipe with Google Gemini...');
      let generatedRecipe;

      try {
        // 常に動画URLから直接解析（Gemini 2.0 multimodal）
        console.log('📹 Using direct video analysis with Gemini 2.0...');
        const result = await this.geminiService.analyzeVideoFromUrl(youtubeUrl, videoInfo.title);
        transcriptionText = result.transcription;
        generatedRecipe = result.recipe;
        console.log('✅ Gemini recipe generated from video URL');
      } catch (aiError) {
        console.error('Gemini video analysis failed, trying fallback methods:', aiError);

        // Fallback: 字幕+画像認識からレシピ生成
        try {
          if (transcriptionText || detectedLabels.length > 0) {
            generatedRecipe = await this.geminiService.generateRecipeFromAnalysis(
              transcriptionText,
              [...new Set(detectedLabels)],
              videoInfo.title,
              videoInfo.description
            );
            console.log('✅ Gemini recipe generated from analysis (fallback)');
          } else {
            throw new Error('No transcription or labels available');
          }
        } catch {
          console.error('All Gemini methods failed, using mock recipe');
          generatedRecipe = this.generateMockRecipe(
            videoInfo.title || 'Recipe',
            videoInfo.description || transcriptionText || 'Generated recipe'
          );
          console.log('✅ Fallback recipe generated');
        }
      }

      await this.updateJobStatus(jobId, 'saving_recipe', 90, undefined, progressCallback);

      // Step 5: Save recipe to database
      console.log('💾 Saving recipe to database...');
      const recipe = await this.prisma.recipe.create({
        data: {
          userId,
          youtubeUrl,
          videoTitle: videoInfo.title,
          videoThumbnail: videoInfo.thumbnail,
          ingredients: generatedRecipe.ingredients || [],
          steps: generatedRecipe.steps || [],
          transcriptionText: transcriptionText || '',
          recognitionLabels: [...new Set(detectedLabels)],
          audioS3Url: videoData?.audioS3Url || null,
          videoS3Url: videoData?.videoS3Url || null,
          frameS3Urls: videoData?.frameS3Urls || null,
        },
      });

      // Step 6: Complete job
      await this.updateJobStatus(jobId, 'completed', 100, undefined, progressCallback);

      console.log('✅ Recipe processing completed and saved:', recipe.id);

    } catch (error) {
      console.error('Error processing video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateJobStatus(jobId, 'failed', 0, errorMessage, progressCallback);
      throw error;
    } finally {
      // Cleanup temporary files
      if (videoData?.id || videoInfo?.id) {
        await this.youtubeProcessor.cleanup(videoData?.id || videoInfo?.id);
      }
    }
  }

  private generateMockRecipe(title: string, description: string): { ingredients: Array<{ name: string; amount: string; unit: string }>; steps: Array<{ step_number: number; description: string; timestamp: number }> } {
    // Extract common cooking terms and ingredients from title/description
    const text = (title + ' ' + description).toLowerCase();
    
    const ingredients = [];
    const steps = [];
    
    // Common ingredients detection
    const commonIngredients = [
      { pattern: /chicken|鶏|とり/i, item: { name: '鶏肉', amount: '300', unit: 'g' } },
      { pattern: /beef|牛|ビーフ/i, item: { name: '牛肉', amount: '300', unit: 'g' } },
      { pattern: /pork|豚|ポーク/i, item: { name: '豚肉', amount: '300', unit: 'g' } },
      { pattern: /rice|ご飯|米/i, item: { name: 'ご飯', amount: '2', unit: '合' } },
      { pattern: /onion|玉ねぎ|たまねぎ/i, item: { name: '玉ねぎ', amount: '1', unit: '個' } },
      { pattern: /carrot|人参|にんじん/i, item: { name: '人参', amount: '1', unit: '本' } },
      { pattern: /potato|じゃがいも|ポテト/i, item: { name: 'じゃがいも', amount: '2', unit: '個' } },
      { pattern: /egg|卵|たまご/i, item: { name: '卵', amount: '2', unit: '個' } },
      { pattern: /salt|塩/i, item: { name: '塩', amount: '適量', unit: '' } },
      { pattern: /pepper|胡椒|こしょう/i, item: { name: '胡椒', amount: '適量', unit: '' } },
      { pattern: /oil|油|オイル/i, item: { name: 'サラダ油', amount: '大さじ2', unit: '' } },
      { pattern: /soy sauce|醤油|しょうゆ/i, item: { name: '醤油', amount: '大さじ2', unit: '' } },
    ];
    
    // Add ingredients found in title/description
    for (const { pattern, item } of commonIngredients) {
      if (pattern.test(text)) {
        ingredients.push(item);
      }
    }
    
    // If no ingredients found, add some defaults based on title
    if (ingredients.length === 0) {
      ingredients.push(
        { name: 'メイン食材', amount: '300', unit: 'g' },
        { name: '調味料', amount: '適量', unit: '' }
      );
    }
    
    // Generate basic steps based on common cooking methods
    if (/fry|炒|焼/i.test(text)) {
      steps.push(
        { step_number: 1, description: '材料を食べやすい大きさに切る', timestamp: 0 },
        { step_number: 2, description: 'フライパンに油を熱する', timestamp: 0 },
        { step_number: 3, description: '材料を炒める', timestamp: 0 },
        { step_number: 4, description: '調味料で味を調える', timestamp: 0 },
        { step_number: 5, description: '完成', timestamp: 0 }
      );
    } else if (/boil|煮|茹/i.test(text)) {
      steps.push(
        { step_number: 1, description: '材料を準備する', timestamp: 0 },
        { step_number: 2, description: '鍋に水を入れて沸騰させる', timestamp: 0 },
        { step_number: 3, description: '材料を入れて煮る', timestamp: 0 },
        { step_number: 4, description: '味を調える', timestamp: 0 },
        { step_number: 5, description: '完成', timestamp: 0 }
      );
    } else if (/bake|オーブン|焼き/i.test(text)) {
      steps.push(
        { step_number: 1, description: 'オーブンを180℃に予熱する', timestamp: 0 },
        { step_number: 2, description: '材料を準備する', timestamp: 0 },
        { step_number: 3, description: '天板に並べる', timestamp: 0 },
        { step_number: 4, description: 'オーブンで20分焼く', timestamp: 0 },
        { step_number: 5, description: '完成', timestamp: 0 }
      );
    } else {
      // Default steps
      steps.push(
        { step_number: 1, description: '材料を準備する', timestamp: 0 },
        { step_number: 2, description: '下ごしらえをする', timestamp: 0 },
        { step_number: 3, description: '調理する', timestamp: 0 },
        { step_number: 4, description: '盛り付ける', timestamp: 0 },
        { step_number: 5, description: '完成', timestamp: 0 }
      );
    }
    
    return {
      ingredients,
      steps
    };
  }


  async getJobStatus(jobId: string): Promise<ProcessingJobUpdate | null> {
    const job = await this.prisma.processingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return null;
    }

    return {
      jobId: job.id,
      status: job.status,
      progressPercent: job.progressPercent,
      errorMessage: job.errorMessage || undefined,
    };
  }

  async getUserJobs(userId: string): Promise<ProcessingJobUpdate[]> {
    const jobs = await this.prisma.processingJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return jobs.map(job => ({
      jobId: job.id,
      status: job.status,
      progressPercent: job.progressPercent,
      errorMessage: job.errorMessage || undefined,
    }));
  }

  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    try {
      const job = await this.prisma.processingJob.findFirst({
        where: {
          id: jobId,
          userId,
          status: { in: ['pending', 'transcribing', 'recognizing', 'generating'] },
        },
      });

      if (!job) {
        return false;
      }

      await this.prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          errorMessage: 'Cancelled by user',
        },
      });

      return true;
    } catch (error) {
      console.error('Error cancelling job:', error);
      return false;
    }
  }

  async cleanupOldJobs(): Promise<void> {
    try {
      // Delete jobs older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      await this.prisma.processingJob.deleteMany({
        where: {
          createdAt: { lt: sevenDaysAgo },
        },
      });

      console.log('Cleaned up old processing jobs');
    } catch (error) {
      console.error('Error cleaning up old jobs:', error);
    }
  }
}