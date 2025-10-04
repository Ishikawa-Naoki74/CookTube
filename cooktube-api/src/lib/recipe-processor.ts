import { PrismaClient, JobStatus } from '@prisma/client';
import { YouTubeService } from './youtube';
import { AWSTranscribeService } from './aws-transcribe';
import { AWSRekognitionService } from './aws-rekognition';
import { AWSRekognitionVideoService } from './aws-rekognition-video';
import { VideoProcessor } from './video-processor';
import { AWSBedrockService } from './aws-bedrock';
import { YouTubeProcessor } from './youtube-processor';
import { FrameAnalyzer } from './frame-analyzer';

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
  private transcribeService: AWSTranscribeService;
  private rekognitionService: AWSRekognitionService;
  private rekognitionVideoService: AWSRekognitionVideoService;
  private videoProcessor: VideoProcessor;
  private bedrockService: AWSBedrockService;
  private youtubeProcessor: YouTubeProcessor;
  private frameAnalyzer: FrameAnalyzer;

  constructor() {
    console.log('🏗️  Initializing RecipeProcessorService');
    this.prisma = new PrismaClient();
    this.youtubeService = new YouTubeService();
    this.transcribeService = new AWSTranscribeService();
    this.rekognitionService = new AWSRekognitionService();
    this.rekognitionVideoService = new AWSRekognitionVideoService();
    this.videoProcessor = new VideoProcessor();
    this.bedrockService = new AWSBedrockService();
    this.youtubeProcessor = new YouTubeProcessor();
    this.frameAnalyzer = new FrameAnalyzer();
    console.log('✅ RecipeProcessorService initialized');
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
    let videoData: any = null;
    let videoInfo: any = null;

    try {
      // Step 1: Get video information from YouTube API
      await this.updateJobStatus(jobId, 'pending', 5, undefined, progressCallback);
      
      console.log('🎬 Fetching video info for:', youtubeUrl);
      videoInfo = await YouTubeService.getVideoInfo(youtubeUrl);
      console.log('✅ Video info retrieved:', {
        id: videoInfo.id,
        title: videoInfo.title,
        duration: videoInfo.duration,
        uploader: videoInfo.uploader
      });

      await this.updateJobStatus(jobId, 'pending', 10, undefined, progressCallback);

      // Step 2: Process video with yt-dlp (transcript + audio + frames)
      console.log('📥 Processing video with yt-dlp...');
      try {
        videoData = await this.youtubeProcessor.processVideo(youtubeUrl, videoInfo.id);
        console.log('✅ Video processing completed');
      } catch (error) {
        console.error('Video processing error:', error);
        // Continue with just basic video info
      }

      await this.updateJobStatus(jobId, 'transcribing', 25, undefined, progressCallback);

      // Step 3: Enhanced Transcription - Use YouTube transcript or AWS Transcribe with fallbacks
      let transcriptionText = '';
      
      if (videoData?.transcript && videoData.transcript.length > 100) {
        console.log('✅ Using YouTube transcript (length:', videoData.transcript.length, ')');
        transcriptionText = videoData.transcript;
      } else {
        console.log('🔄 YouTube transcript insufficient, using AWS Transcribe...');
        if (videoData?.audioPath) {
          try {
            console.log('🎙️ Starting AWS Transcribe for detailed audio analysis...');
            const transcriptionResult = await this.transcribeService.transcribeAudio(videoData.audioPath, videoInfo.id);
            transcriptionText = transcriptionResult.text;
            console.log('✅ AWS Transcription completed, length:', transcriptionText.length);
            
            // Combine with YouTube transcript if available for better accuracy
            if (videoData?.transcript && videoData.transcript.length > 0) {
              transcriptionText = `${videoData.transcript}\n\n[AWS補完音声解析]\n${transcriptionText}`;
              console.log('✅ Combined YouTube transcript with AWS Transcribe result');
            }
          } catch (error) {
            console.error('AWS Transcription error:', error);
            if (videoData?.transcript) {
              transcriptionText = videoData.transcript;
              console.log('⚠️ Falling back to available YouTube transcript');
            }
          }
        } else if (videoData?.transcript) {
          transcriptionText = videoData.transcript;
          console.log('⚠️ Using available YouTube transcript (audio download failed)');
        }
      }

      await this.updateJobStatus(jobId, 'recognizing', 50, undefined, progressCallback);

      // Step 4: Image and Video recognition using AWS Rekognition
      let recognitionLabels: string[] = [];
      let videoAnalysisResult: any = null;
      
      // 4a. Static frame analysis
      if (videoData?.thumbnailFrames && videoData.thumbnailFrames.length > 0) {
        try {
          console.log('👁️ Starting AWS Rekognition for frames...');
          for (const framePath of videoData.thumbnailFrames) {
            const labels = await this.rekognitionService.detectLabels(framePath);
            recognitionLabels.push(...labels.map((l: any) => l.name));
          }
          console.log('✅ Frame recognition completed:', recognitionLabels.length, 'labels found');
        } catch (error) {
          console.error('AWS Recognition error:', error);
        }
      }

      // 4b. Video analysis if video is uploaded to S3
      if (videoData?.videoS3Url) {
        try {
          console.log('🎬 Starting AWS Rekognition Video analysis...');
          const s3Uri = videoData.videoS3Url.replace('https://', 's3://').replace('.s3.ap-northeast-1.amazonaws.com', '');
          const jobId = await this.rekognitionVideoService.startVideoLabelDetection(s3Uri);
          console.log('⏳ Video analysis job started:', jobId);
          
          // Wait for analysis to complete (with timeout)
          await this.rekognitionVideoService.waitForJobCompletion(jobId, 60000); // 1 minute timeout
          
          // Get analysis results
          videoAnalysisResult = await this.rekognitionVideoService.getVideoAnalysisResults(jobId);
          
          // Add video-detected ingredients to recognition labels
          for (const ingredient of videoAnalysisResult.ingredients) {
            recognitionLabels.push(ingredient);
          }
          
          console.log('✅ Video analysis completed:', {
            ingredients: videoAnalysisResult.ingredients.size,
            tools: videoAnalysisResult.cookingTools.size,
            actions: videoAnalysisResult.cookingActions.length,
          });
        } catch (error) {
          console.error('AWS Rekognition Video error:', error);
        }
      }

      // Step 4c: Enhanced frame analysis for Shorts videos
      let frameAnalysisResult: any = null;
      if (videoData?.frameS3Urls && videoData.frameS3Urls.length > 0) {
        try {
          console.log('🔬 Starting enhanced frame analysis...');
          const isShortVideo = this.isShortVideo(videoInfo);
          
          // Process a few key frames with detailed analysis
          const keyFrames = videoData.frameS3Urls.slice(0, 5); // Analyze first 5 frames
          let allIngredients: any[] = [];
          let allTools: any[] = [];
          let allActions: any[] = [];
          
          for (const frameUrl of keyFrames) {
            try {
              const frameBuffer = await this.downloadFrameFromS3(frameUrl);
              const analysisResult = await this.frameAnalyzer.analyzeFrame(frameBuffer, isShortVideo);
              
              allIngredients.push(...analysisResult.ingredients);
              allTools.push(...analysisResult.tools);
              allActions.push(...analysisResult.actions);
            } catch (frameError) {
              console.error(`Frame analysis error for ${frameUrl}:`, frameError);
            }
          }
          
          // Deduplicate and sort by confidence
          frameAnalysisResult = {
            ingredients: this.deduplicateByName(allIngredients).sort((a: any, b: any) => b.confidence - a.confidence),
            tools: this.deduplicateByName(allTools).sort((a: any, b: any) => b.confidence - a.confidence),
            actions: this.deduplicateByName(allActions, 'action').sort((a: any, b: any) => b.confidence - a.confidence)
          };
          
          console.log(`✅ Enhanced frame analysis completed: ${frameAnalysisResult.ingredients.length} ingredients, ${frameAnalysisResult.tools.length} tools, ${frameAnalysisResult.actions.length} actions`);
        } catch (error) {
          console.error('Enhanced frame analysis error:', error);
        }
      }

      await this.updateJobStatus(jobId, 'generating', 75, undefined, progressCallback);

      // Step 5: Generate recipe using AWS Bedrock
      console.log('🤖 Generating recipe with AWS Bedrock...');
      
      // Step 5a: Integrate audio and visual analysis
      let integratedAnalysis: any = null;
      if (transcriptionText && frameAnalysisResult) {
        try {
          console.log('🔗 Integrating audio and visual analysis...');
          integratedAnalysis = this.integrateAudioVisualAnalysis(
            transcriptionText,
            frameAnalysisResult,
            recognitionLabels
          );
          console.log(`✅ Audio-visual integration completed with ${integratedAnalysis.confidence}% confidence`);
        } catch (error) {
          console.error('Integration error:', error);
        }
      }

      let generatedRecipe;
      try {
        const prompt = this.createRecipePrompt(
          videoInfo,
          transcriptionText,
          [...new Set(recognitionLabels)], // Remove duplicates
          frameAnalysisResult,
          integratedAnalysis
        );

        generatedRecipe = await this.bedrockService.generateRecipe(prompt);
        console.log('✅ AWS Bedrock recipe generated');
      } catch (aiError) {
        console.error('AWS Bedrock error, using fallback:', aiError);
        // Use enhanced fallback based on available data
        generatedRecipe = this.generateMockRecipe(
          videoInfo.title || 'Recipe',
          videoInfo.description || transcriptionText || 'Generated recipe'
        );
        console.log('✅ Enhanced fallback recipe generated');
      }

      await this.updateJobStatus(jobId, 'generating', 95, undefined, progressCallback);

      // Step 6: Save recipe to Supabase
      console.log('💾 Saving recipe to Supabase...');
      const recipe = await this.prisma.recipe.create({
        data: {
          userId,
          youtubeUrl,
          videoTitle: videoInfo.title,
          videoThumbnail: videoInfo.thumbnail,
          ingredients: generatedRecipe.ingredients || [],
          steps: generatedRecipe.steps || [],
          transcriptionText: transcriptionText || '',
          recognitionLabels: [...new Set(recognitionLabels)],
          audioS3Url: videoData?.audioS3Url || null,
          videoS3Url: videoData?.videoS3Url || null,
          frameS3Urls: videoData?.frameS3Urls || null,
        },
      });

      // Step 7: Complete job
      await this.updateJobStatus(jobId, 'completed', 100, undefined, progressCallback);

      console.log('✅ Recipe processing completed and saved to Supabase:', recipe.id);

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

  private generateMockRecipe(title: string, description: string): any {
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

  private createRecipePrompt(
    videoInfo: any,
    transcription: string,
    labels: string[],
    frameAnalysisResult?: any,
    integratedAnalysis?: any
  ): string {
    // ショート動画かどうかを判定
    const isShortVideo = this.isShortVideo(videoInfo);
    
    if (isShortVideo) {
      return this.createShortsRecipePrompt(videoInfo, transcription, labels, frameAnalysisResult, integratedAnalysis);
    } else {
      return this.createRegularRecipePrompt(videoInfo, transcription, labels, frameAnalysisResult, integratedAnalysis);
    }
  }

  private isShortVideo(videoInfo: any): boolean {
    const url = videoInfo?.youtubeUrl || '';
    const duration = parseInt(videoInfo?.duration) || 0;
    
    return url.includes('/shorts/') || url.includes('youtube.com/shorts') || duration <= 60;
  }

  private createShortsRecipePrompt(
    videoInfo: any,
    transcription: string,
    labels: string[],
    frameAnalysisResult?: any,
    integratedAnalysis?: any
  ): string {
    const ingredients = frameAnalysisResult?.ingredients || [];
    const tools = frameAnalysisResult?.tools || [];
    const actions = frameAnalysisResult?.actions || [];

    return `
あなたは短時間動画レシピ解析のプロフェッショナルです。YouTube Shorts動画（60秒以下）の情報から、実践的なレシピを抽出してください。

⚠️ SHORTS動画の特徴を考慮してください：
- 短時間で完結する簡単なレシピ
- 基本的な食材と調理法
- 視覚的にわかりやすい手順
- 一つのメイン料理に集中

【動画情報】
タイトル: ${videoInfo.title}
時間: ${videoInfo.duration}秒（ショート動画）

【音声転写内容】:
${transcription || '音声転写なし'}

【詳細フレーム分析結果】:
検出食材: ${ingredients.map((i: any) => `${i.name}(信頼度:${i.confidence}%)`).join(', ') || '検出なし'}
検出調理器具: ${tools.map((t: any) => `${t.name}(信頼度:${t.confidence}%)`).join(', ') || '検出なし'}
推論された調理動作: ${actions.map((a: any) => `${a.action}(信頼度:${a.confidence}%)`).join(', ') || '検出なし'}

【基本ラベル】: ${labels.join(', ') || '検出項目なし'}

${integratedAnalysis ? `
【統合分析結果】(信頼度:${integratedAnalysis.confidence}%):
音声から検出された食材: ${integratedAnalysis.audioKeywords.ingredients.join(', ') || 'なし'}
音声から検出された動作: ${integratedAnalysis.audioKeywords.actions.join(', ') || 'なし'}
統合食材リスト: ${integratedAnalysis.ingredients.map((i: any) => `${i.name}(${i.source})`).join(', ') || 'なし'}
統合手順: ${integratedAnalysis.steps.map((s: any) => `${s.description}(${s.source})`).join(' → ') || 'なし'}
` : ''}

🔥 SHORTS専用指示:
1. 材料は5個以内の簡単なもの
2. 手順は3-5ステップに絞る
3. 各ステップは30秒以内で完了できるもの
4. 専門用語を避け、初心者でも理解できる表現
5. 時間や分量は「少々」「適量」より具体的に

以下のJSON形式で生成してください：

{
  "ingredients": [
    { 
      "name": "食材名", 
      "amount": "分量", 
      "unit": "単位",
      "notes": "簡単な説明"
    }
  ],
  "steps": [
    { 
      "step_number": 1, 
      "description": "簡潔で具体的な手順（時間・火加減込み）", 
      "duration": "時間",
      "tips": "失敗しないコツ"
    }
  ]
}`;
  }

  private createRegularRecipePrompt(
    videoInfo: any,
    transcription: string,
    labels: string[],
    frameAnalysisResult?: any,
    integratedAnalysis?: any
  ): string {
    return `
あなたは経験豊富な料理研究家であり、YouTube料理動画の詳細分析のスペシャリストです。以下の情報から、実際に料理できる完全なレシピを詳細に抽出・構築してください。

【動画情報】
タイトル: ${videoInfo.title}
説明: ${videoInfo.description}

【音声転写内容（動画全体で話された全ての内容）】:
${transcription || '音声転写なし'}

【動画から検出された食材・器具（15フレーム分析結果）】:
${labels.join(', ') || '検出項目なし'}

以下のJSON形式で詳細なレシピを生成してください：

{
  "ingredients": [
    { 
      "name": "具体的な食材名", 
      "amount": "正確な分量", 
      "unit": "単位（g/ml/個/本/枚等）",
      "notes": "下処理方法や代替案",
      "category": "メイン食材/調味料/香辛料/その他"
    }
  ],
  "steps": [
    { 
      "step_number": 1, 
      "description": "詳細な手順説明（火加減、時間、見た目の変化を含む）", 
      "duration": "所要時間",
      "temperature": "火加減・温度",
      "tips": "成功のコツ・注意点",
      "tools": ["使用する調理器具"]
    }
  ]
}

【重要な分析要件】:
1. **材料の完全抽出**: 転写から全ての材料を抽出（調味料、隠し味まで含む）
2. **分量の具体化**: 「少々」「適量」→「小さじ1/4」「大さじ2」等に変換
3. **手順の細分化**: 最低10-15ステップに詳細分割（下準備から盛り付けまで）
4. **調理条件の明確化**: 火力、時間、温度を各ステップで明記
5. **視覚的変化の記述**: 「きつね色になるまで」「泡が出てきたら」等の目安
6. **並行作業の構造化**: 同時進行の作業も適切にステップ化
7. **初心者対応**: 基本的な調理技法も説明に含める

転写内容を単語レベルで精査し、料理に関する全ての情報を見逃さずに抽出してください。
JSON形式のレスポンスのみを提供し、追加説明は不要です。
    `.trim();
  }

  /**
   * S3からフレームをダウンロード
   */
  private async downloadFrameFromS3(frameUrl: string): Promise<Buffer> {
    const response = await fetch(frameUrl);
    if (!response.ok) {
      throw new Error(`Failed to download frame: ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * 名前による重複除去
   */
  private deduplicateByName(items: any[], nameField: string = 'name'): any[] {
    const seen = new Set<string>();
    return items.filter(item => {
      const name = item[nameField]?.toLowerCase();
      if (name && !seen.has(name)) {
        seen.add(name);
        return true;
      }
      return false;
    });
  }

  /**
   * 音声転写と映像分析結果を統合して解析を強化
   */
  private integrateAudioVisualAnalysis(
    transcription: string,
    frameAnalysisResult: any,
    recognitionLabels: string[]
  ): any {
    const audioKeywords = this.extractAudioKeywords(transcription);
    const visualIngredients = frameAnalysisResult?.ingredients || [];
    const visualActions = frameAnalysisResult?.actions || [];
    
    const integratedIngredients = this.mergeAudioVisualIngredients(audioKeywords.ingredients, visualIngredients);
    const audioSteps = this.extractStepsFromAudio(transcription);
    const integratedSteps = this.integrateCookingSteps(audioSteps, visualActions);
    
    return {
      ingredients: integratedIngredients,
      actions: visualActions,
      steps: integratedSteps,
      audioKeywords,
      confidence: this.calculateIntegrationConfidence(transcription, frameAnalysisResult)
    };
  }

  /**
   * 音声からキーワードを抽出
   */
  private extractAudioKeywords(transcription: string): any {
    const text = transcription.toLowerCase();
    
    const ingredientPatterns = [
      /(?:玉ねぎ|たまねぎ|onion)/g,
      /(?:トマト|tomato)/g,
      /(?:じゃがいも|ジャガイモ|potato)/g,
      /(?:人参|にんじん|ニンジン|carrot)/g,
      /(?:卵|たまご|egg)/g,
      /(?:鶏肉|とりにく|chicken)/g,
      /(?:牛肉|beef)/g,
      /(?:豚肉|pork)/g,
      /(?:米|こめ|rice)/g,
      /(?:パン|bread)/g,
      /(?:チーズ|cheese)/g,
      /(?:バター|butter)/g,
      /(?:油|あぶら|oil)/g,
      /(?:塩|しお|salt)/g,
      /(?:胡椒|こしょう|pepper)/g,
      /(?:醤油|しょうゆ)/g,
      /(?:味噌|みそ)/g,
      /(?:砂糖|さとう|sugar)/g
    ];

    const ingredients: string[] = [];
    ingredientPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        ingredients.push(...matches);
      }
    });

    const actionPatterns = [
      /(?:切る|きる|刻む|きざむ|カット)/g,
      /(?:炒める|いためる|フライ)/g,
      /(?:煮る|にる|茹でる|ゆでる|ボイル)/g,
      /(?:焼く|やく|グリル|ベイク)/g,
      /(?:混ぜる|まぜる|ミックス)/g,
      /(?:蒸す|むす|スチーム)/g,
      /(?:揚げる|あげる)/g,
      /(?:盛り付け|もりつけ|プレート)/g
    ];

    const actions: string[] = [];
    actionPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        actions.push(...matches);
      }
    });

    return {
      ingredients: [...new Set(ingredients)],
      actions: [...new Set(actions)],
      times: [],
      temperatures: []
    };
  }

  /**
   * 音声と映像の食材情報を統合
   */
  private mergeAudioVisualIngredients(audioIngredients: string[], visualIngredients: any[]): any[] {
    const merged = [...visualIngredients];
    const visualNames = new Set(visualIngredients.map(v => v.name.toLowerCase()));

    audioIngredients.forEach(audioIngredient => {
      if (!visualNames.has(audioIngredient.toLowerCase())) {
        merged.push({
          name: audioIngredient,
          confidence: 80,
          source: 'audio',
          category: this.categorizeIngredient(audioIngredient.toLowerCase())
        });
      }
    });

    return merged;
  }

  /**
   * 音声から調理手順を抽出
   */
  private extractStepsFromAudio(transcription: string): any[] {
    const text = transcription.toLowerCase();
    const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 0);
    
    const steps: any[] = [];
    const stepIndicators = [
      'まず', 'はじめに', 'first', '最初に',
      '次に', 'つぎに', 'next', 'then',
      '最後に', 'さいごに', 'finally', 'last',
      'その後', 'あとで', 'after'
    ];

    let stepNumber = 1;
    
    sentences.forEach((sentence, index) => {
      const trimmed = sentence.trim();
      
      const hasStepIndicator = stepIndicators.some(indicator => trimmed.includes(indicator));
      const hasAction = /(?:切る|炒める|煮る|焼く|混ぜる|加える|調理|料理)/.test(trimmed);
      
      if ((hasStepIndicator || hasAction) && trimmed.length > 5) {
        steps.push({
          stepNumber,
          description: trimmed,
          timestamp: 0,
          confidence: hasStepIndicator ? 85 : 70,
          source: 'audio'
        });
        stepNumber++;
      }
    });

    return steps;
  }

  /**
   * 音声手順と映像アクションを統合
   */
  private integrateCookingSteps(audioSteps: any[], visualActions: any[]): any[] {
    const integratedSteps = [...audioSteps];
    
    visualActions.forEach((action, index) => {
      const relatedAudioStep = audioSteps.find(step => 
        step.description.includes(action.action.toLowerCase()) ||
        this.isRelatedAction(step.description, action.action)
      );
      
      if (!relatedAudioStep) {
        integratedSteps.push({
          stepNumber: audioSteps.length + index + 1,
          description: `${action.action}（映像分析）`,
          timestamp: 0,
          confidence: action.confidence,
          source: 'visual',
          visualData: {
            ingredients: action.relatedIngredients?.map((i: any) => i.name) || [],
            tools: action.relatedTools?.map((t: any) => t.name) || []
          }
        });
      }
    });

    return integratedSteps.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 音声記述と映像アクションの関連性を判定
   */
  private isRelatedAction(audioDescription: string, visualAction: string): boolean {
    const actionMap: { [key: string]: string[] } = {
      'cutting': ['切る', 'カット', '刻む'],
      'frying': ['炒める', '焼く', 'フライ'],
      'mixing': ['混ぜる', 'ミックス', 'かき混ぜ'],
      'cooking': ['調理', '料理', '作る'],
      'boiling': ['茹でる', '煮る'],
      'steaming': ['蒸す', 'スチーム']
    };

    const relatedTerms = actionMap[visualAction.toLowerCase()] || [];
    return relatedTerms.some(term => audioDescription.includes(term));
  }

  /**
   * 統合分析の信頼度を計算
   */
  private calculateIntegrationConfidence(transcription: string, frameAnalysisResult: any): number {
    let confidence = 50;

    if (transcription && transcription.length > 100) {
      confidence += 20;
    }

    if (frameAnalysisResult?.ingredients?.length > 0) {
      confidence += 15;
    }

    if (frameAnalysisResult?.actions?.length > 0) {
      confidence += 15;
    }

    return Math.min(confidence, 100);
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