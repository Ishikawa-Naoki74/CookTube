import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { YoutubeTranscript } from 'youtube-transcript';
import { AWSS3Service } from './aws-s3';
import { AWSRekognitionVideoService, VideoAnalysisResult } from './aws-rekognition-video';

export interface YouTubeVideoData {
  id: string;
  title: string;
  description: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  transcript?: string;
  audioPath?: string;
  audioS3Url?: string;
  videoPath?: string;
  videoS3Url?: string;
  thumbnailFrames?: string[];
  frameS3Urls?: string[];
  videoAnalysis?: VideoAnalysisResult;
  analysisSummary?: {
    summary: string;
    detectedIngredients: string[];
    detectedTools: string[];
    keyActions: string[];
    confidenceScore: number;
  };
}

export class YouTubeProcessor {
  private tempDir: string;
  private s3Service: AWSS3Service;
  private rekognitionVideoService: AWSRekognitionVideoService;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    this.s3Service = new AWSS3Service();
    this.rekognitionVideoService = new AWSRekognitionVideoService();
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  private async execCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout) => {
        if (error) {
          console.error(`Command error: ${error}`);
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async getVideoTranscript(videoId: string): Promise<string | null> {
    try {
      console.log('[YouTube] Fetching transcript for video:', videoId);
      
      // 利用可能な字幕言語をまず確認
      try {
        console.log('[YouTube] Checking available transcript languages...');
        
        // まずはデフォルトで利用可能な字幕を取得（言語指定なし）
        const defaultTranscripts = await YoutubeTranscript.fetchTranscript(videoId);
        
        if (defaultTranscripts && defaultTranscripts.length > 0) {
          const fullTranscript = defaultTranscripts
            .map(item => item.text)
            .join(' ')
            .replace(/\[音楽\]/g, '')
            .replace(/\[拍手\]/g, '')
            .replace(/\[Music\]/g, '')
            .replace(/\[Applause\]/g, '')
            .trim();
          
          console.log('[YouTube] Default transcript fetched successfully, length:', fullTranscript.length);
          console.log('[YouTube] First 100 characters:', fullTranscript.substring(0, 100));
          return fullTranscript;
        }
      } catch (defaultError: any) {
        console.log('[YouTube] Default transcript error:', defaultError?.message || defaultError);
      }

      // デフォルトで取得できない場合は日本語を明示的に試す
      try {
        console.log('[YouTube] Attempting to fetch Japanese transcript...');
        const transcripts = await YoutubeTranscript.fetchTranscript(videoId, {
          lang: 'ja'
        });

        if (transcripts && transcripts.length > 0) {
          const fullTranscript = transcripts
            .map(item => item.text)
            .join(' ')
            .replace(/\[音楽\]/g, '')
            .replace(/\[拍手\]/g, '')
            .trim();
          
          console.log('[YouTube] Japanese transcript fetched successfully, length:', fullTranscript.length);
          console.log('[YouTube] First 100 characters:', fullTranscript.substring(0, 100));
          return fullTranscript;
        }
      } catch (japaneseError: any) {
        console.log('[YouTube] Japanese transcript error:', japaneseError?.message || japaneseError);
      }

      // 日本語がダメなら英語を試す
      console.log('[YouTube] Japanese transcript not found, trying English...');
      
      try {
        const englishTranscripts = await YoutubeTranscript.fetchTranscript(videoId, {
          lang: 'en'
        });

        if (englishTranscripts && englishTranscripts.length > 0) {
          const fullTranscript = englishTranscripts
            .map(item => item.text)
            .join(' ')
            .replace(/\[Music\]/g, '')
            .replace(/\[Applause\]/g, '')
            .trim();
          
          console.log('[YouTube] English transcript fetched successfully, length:', fullTranscript.length);
          console.log('[YouTube] First 100 characters:', fullTranscript.substring(0, 100));
          return fullTranscript;
        }
      } catch (englishError: any) {
        console.log('[YouTube] English transcript also not available:', englishError?.message || englishError);
      }

      // 最後の手段として自動生成字幕を試す（言語指定なし、自動字幕含む）
      try {
        console.log('[YouTube] Trying auto-generated captions...');
        const autoTranscripts = await YoutubeTranscript.fetchTranscript(videoId);

        if (autoTranscripts && autoTranscripts.length > 0) {
          const fullTranscript = autoTranscripts
            .map(item => item.text)
            .join(' ')
            .replace(/\[音楽\]/g, '')
            .replace(/\[拍手\]/g, '')
            .replace(/\[Music\]/g, '')
            .replace(/\[Applause\]/g, '')
            .trim();
          
          console.log('[YouTube] Auto-generated transcript fetched successfully, length:', fullTranscript.length);
          console.log('[YouTube] First 100 characters:', fullTranscript.substring(0, 100));
          return fullTranscript;
        }
      } catch (autoError: any) {
        console.log('[YouTube] Auto-generated transcript error:', autoError?.message || autoError);
      }

      console.log('[YouTube] No transcript found in any language');
      return null;
    } catch (error) {
      console.error('[YouTube] Error fetching transcript:', error);
      return null;
    }
  }

  async downloadAudio(youtubeUrl: string, videoId: string): Promise<{ localPath: string | null, s3Url: string | null }> {
    try {
      const audioPath = path.join(this.tempDir, `${videoId}.mp3`);
      
      console.log('[YouTube] Downloading audio from:', youtubeUrl);
      
      // yt-dlpを使用して音声のみをダウンロード
      const command = `yt-dlp -x --audio-format mp3 --audio-quality 0 "${youtubeUrl}" -o "${audioPath}"`;
      
      await this.execCommand(command);
      
      // ファイルが存在するかチェック
      try {
        await fs.access(audioPath);
        console.log('[YouTube] Audio downloaded successfully:', audioPath);
        
        // S3にアップロード
        try {
          const s3Key = this.s3Service.generateAudioKey(videoId, `${videoId}.mp3`);
          const s3Url = await this.s3Service.uploadFile(audioPath, s3Key);
          console.log('[YouTube] Audio uploaded to S3:', s3Url);
          return { localPath: audioPath, s3Url };
        } catch (s3Error) {
          console.error('[YouTube] S3 upload failed, keeping local file:', s3Error);
          return { localPath: audioPath, s3Url: null };
        }
      } catch (error) {
        console.error('[YouTube] Audio file not found after download');
        return { localPath: null, s3Url: null };
      }
    } catch (error) {
      console.error('[YouTube] Error downloading audio:', error);
      return { localPath: null, s3Url: null };
    }
  }

  async downloadVideo(youtubeUrl: string, videoId: string): Promise<{ localPath: string | null, s3Url: string | null }> {
    try {
      const videoPath = path.join(this.tempDir, `${videoId}.mp4`);
      
      console.log('[YouTube] Downloading video from:', youtubeUrl);
      
      // yt-dlpを使用して動画をダウンロード（720p以下、MP4形式）
      const command = `yt-dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" --merge-output-format mp4 "${youtubeUrl}" -o "${videoPath}"`;
      
      await this.execCommand(command);
      
      // ファイルが存在するかチェック
      try {
        await fs.access(videoPath);
        console.log('[YouTube] Video downloaded successfully:', videoPath);
        
        // ファイルサイズをチェック（最大500MBに制限）
        const stats = await fs.stat(videoPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        console.log(`[YouTube] Video file size: ${fileSizeMB.toFixed(2)} MB`);
        
        if (fileSizeMB > 500) {
          console.warn('[YouTube] Video file too large, skipping S3 upload');
          return { localPath: videoPath, s3Url: null };
        }
        
        // S3にアップロード
        try {
          const s3Key = this.s3Service.generateVideoKey(videoId, `${videoId}.mp4`);
          const s3Url = await this.s3Service.uploadFile(videoPath, s3Key);
          console.log('[YouTube] Video uploaded to S3:', s3Url);
          return { localPath: videoPath, s3Url };
        } catch (s3Error) {
          console.error('[YouTube] S3 upload failed, keeping local file:', s3Error);
          return { localPath: videoPath, s3Url: null };
        }
      } catch (error) {
        console.error('[YouTube] Video file not found after download');
        return { localPath: null, s3Url: null };
      }
    } catch (error) {
      console.error('[YouTube] Error downloading video:', error);
      return { localPath: null, s3Url: null };
    }
  }

  async extractThumbnailFrames(youtubeUrl: string, videoId: string, count: number = 15): Promise<{ localPaths: string[], s3Urls: string[] }> {
    try {
      console.log('[YouTube] Extracting thumbnail frames from:', youtubeUrl);
      
      const frames: string[] = [];
      const s3Urls: string[] = [];
      
      // まず動画の長さを取得
      let videoDuration = 0;
      try {
        const durationCommand = `yt-dlp --get-duration "${youtubeUrl}"`;
        const durationOutput = await this.execCommand(durationCommand);
        
        // 持続時間をパース (例: "4:13" or "253" seconds)
        const durationStr = durationOutput.trim();
        if (durationStr.includes(':')) {
          const parts = durationStr.split(':').reverse(); // [seconds, minutes, hours?]
          videoDuration = parseInt(parts[0]) + (parseInt(parts[1] || '0') * 60) + (parseInt(parts[2] || '0') * 3600);
        } else {
          videoDuration = parseInt(durationStr) || 60; // フォールバック: 60秒
        }
        
        console.log(`[YouTube] Video duration: ${videoDuration} seconds`);
      } catch (error) {
        console.log('[YouTube] Could not get video duration, using default 60s');
        videoDuration = 60; // デフォルト値
      }
      
      // フレーム抽出のタイムスタンプを計算（動画全体に分散）
      const timestamps: number[] = [];
      
      // 動画の始めから終わりまで等間隔で抽出
      const skipDuration = Math.max(5, videoDuration * 0.05); // 開始5秒またはビデオの5%をスキップ
      const endSkipDuration = Math.max(5, videoDuration * 0.05); // 終了5秒またはビデオの5%をスキップ
      const effectiveStart = skipDuration;
      const effectiveEnd = videoDuration - endSkipDuration;
      const effectiveDuration = effectiveEnd - effectiveStart;
      
      if (effectiveDuration > 0) {
        // 調理過程全体をカバーするよう等間隔で分散
        for (let i = 0; i < count; i++) {
          const position = effectiveStart + (effectiveDuration * i) / (count - 1);
          timestamps.push(Math.floor(position));
        }
      } else {
        // 短すぎる動画の場合
        for (let i = 0; i < Math.min(count, 3); i++) {
          timestamps.push(Math.floor((videoDuration * (i + 1)) / 4));
        }
      }
      
      console.log('[YouTube] Frame timestamps:', timestamps);
      
      // 動画をダウンロードしてからフレーム抽出
      const { localPath: videoPath } = await this.downloadVideo(youtubeUrl, videoId);
      
      if (!videoPath) {
        console.log('[YouTube] Video download failed, cannot extract frames');
        return { localPaths: [], s3Urls: [] };
      }
      
      // 各タイムスタンプでフレーム抽出
      for (let i = 0; i < timestamps.length; i++) {
        const framePath = path.join(this.tempDir, `${videoId}_frame_${i + 1}.jpg`);
        const timestamp = timestamps[i];
        
        try {
          // ffmpegを使って特定の時間のフレームを抽出
          const command = `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}" -y`;
          
          await this.execCommand(command);
          
          // ファイルが存在するかチェック
          try {
            await fs.access(framePath);
            frames.push(framePath);
            console.log(`[YouTube] Frame ${i + 1} extracted at ${timestamp}s:`, framePath);
            
            // S3にアップロード
            try {
              const s3Key = this.s3Service.generateImageKey(videoId, `frame_${i + 1}.jpg`);
              const s3Url = await this.s3Service.uploadFile(framePath, s3Key);
              s3Urls.push(s3Url);
              console.log(`[YouTube] Frame ${i + 1} uploaded to S3:`, s3Url);
            } catch (s3Error) {
              console.error(`[YouTube] S3 upload failed for frame ${i + 1}:`, s3Error);
            }
          } catch (error) {
            console.log(`[YouTube] Frame ${i + 1} extraction failed, continuing...`);
          }
        } catch (error) {
          console.log(`[YouTube] Error extracting frame ${i + 1}:`, error);
        }
      }
      
      console.log('[YouTube] Frames extracted successfully:', frames.length);
      console.log('[YouTube] Frames uploaded to S3:', s3Urls.length);
      return { localPaths: frames, s3Urls };
    } catch (error) {
      console.error('[YouTube] Error extracting frames:', error);
      return { localPaths: [], s3Urls: [] };
    }
  }

  async processVideo(youtubeUrl: string, videoId: string): Promise<YouTubeVideoData> {
    try {
      console.log('[YouTube] Processing video:', videoId);
      
      // 1. 基本的な動画情報を取得（YouTubeServiceから）
      const videoInfo = {
        id: videoId,
        title: '',
        description: '',
        duration: 0,
        thumbnail: '',
        uploader: ''
      };

      // 2. 字幕/トランスクリプトを取得
      const transcript = await this.getVideoTranscript(videoId);
      
      // 3. 音声をダウンロード
      const audioResult = await this.downloadAudio(youtubeUrl, videoId);
      
      // 4. 動画をダウンロード
      const videoResult = await this.downloadVideo(youtubeUrl, videoId);
      
      // 5. サムネイルフレームを抽出（ローカル動画ファイルから） - より多くのフレームを抽出
      let framesResult: { localPaths: string[], s3Urls: string[] } = { localPaths: [], s3Urls: [] };
      if (videoResult.localPath) {
        framesResult = await this.extractFramesFromLocalVideo(videoResult.localPath, videoId, 15);
      }

      // 6. 動画全体解析（AWS Rekognition Video）
      let videoAnalysis: VideoAnalysisResult | undefined;
      let analysisSummary: any | undefined;
      
      if (videoResult.localPath) {
        try {
          console.log('[YouTube] Starting full video analysis with Rekognition Video...');
          videoAnalysis = await this.rekognitionVideoService.analyzeFullVideo(videoResult.localPath, videoId);
          analysisSummary = this.rekognitionVideoService.generateAnalysisSummary(videoAnalysis);
          console.log('[YouTube] Video analysis completed:', analysisSummary.summary);
        } catch (error) {
          console.error('[YouTube] Video analysis failed:', error);
          // 動画解析が失敗しても他の処理は続行
        }
      }
      
      return {
        ...videoInfo,
        transcript: transcript || undefined,
        audioPath: audioResult.localPath || undefined,
        audioS3Url: audioResult.s3Url || undefined,
        videoPath: videoResult.localPath || undefined,
        videoS3Url: videoResult.s3Url || undefined,
        thumbnailFrames: framesResult.localPaths.length > 0 ? framesResult.localPaths : undefined,
        frameS3Urls: framesResult.s3Urls.length > 0 ? framesResult.s3Urls : undefined,
        videoAnalysis,
        analysisSummary
      };
    } catch (error) {
      console.error('[YouTube] Error processing video:', error);
      throw new Error('Failed to process video');
    }
  }

  async extractFramesFromLocalVideo(videoPath: string, videoId: string, count: number = 15): Promise<{ localPaths: string[], s3Urls: string[] }> {
    try {
      console.log('[YouTube] Extracting frames from local video:', videoPath);
      
      const frames: string[] = [];
      const s3Urls: string[] = [];
      
      // 動画の長さを取得
      const durationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
      const durationStr = await this.execCommand(durationCommand);
      const duration = parseFloat(durationStr);
      
      // 動画全体から等間隔でフレームを抽出（調理過程全体をカバー）
      const skipDuration = Math.max(5, duration * 0.05); // 開始5秒またはビデオの5%をスキップ
      const endSkipDuration = Math.max(5, duration * 0.05); // 終了5秒またはビデオの5%をスキップ
      const effectiveStart = skipDuration;
      const effectiveEnd = duration - endSkipDuration;
      const effectiveDuration = effectiveEnd - effectiveStart;
      
      for (let i = 0; i < count; i++) {
        const framePath = path.join(this.tempDir, `${videoId}_frame_${i + 1}.jpg`);
        const timestamp = effectiveStart + (effectiveDuration * i) / (count - 1); // 動画全体に分散
        
        try {
          // ffmpegを使って特定の時間のフレームを抽出
          const command = `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}" -y`;
          
          await this.execCommand(command);
          
          // ファイルが存在するかチェック
          try {
            await fs.access(framePath);
            frames.push(framePath);
            console.log(`[YouTube] Frame ${i} extracted at ${timestamp.toFixed(2)}s:`, framePath);
            
            // S3にアップロード
            try {
              const s3Key = this.s3Service.generateImageKey(videoId, `frame_${i}.jpg`);
              const s3Url = await this.s3Service.uploadFile(framePath, s3Key);
              s3Urls.push(s3Url);
              console.log(`[YouTube] Frame ${i} uploaded to S3:`, s3Url);
            } catch (s3Error) {
              console.error(`[YouTube] S3 upload failed for frame ${i}:`, s3Error);
            }
          } catch (error) {
            console.log(`[YouTube] Frame ${i} extraction failed, continuing...`);
          }
        } catch (error) {
          console.log(`[YouTube] Error extracting frame ${i}:`, error);
        }
      }
      
      console.log('[YouTube] Frames extracted successfully:', frames.length);
      console.log('[YouTube] Frames uploaded to S3:', s3Urls.length);
      return { localPaths: frames, s3Urls };
    } catch (error) {
      console.error('[YouTube] Error extracting frames from local video:', error);
      return { localPaths: [], s3Urls: [] };
    }
  }

  async cleanup(videoId: string): Promise<void> {
    try {
      const files = [
        path.join(this.tempDir, `${videoId}.mp3`),
        path.join(this.tempDir, `${videoId}.mp4`),
        path.join(this.tempDir, `${videoId}.webm`),
        path.join(this.tempDir, `${videoId}.m4a`),
      ];
      
      // フレームファイルも追加
      for (let i = 1; i <= 10; i++) {
        files.push(path.join(this.tempDir, `${videoId}_frame_${i}.jpg`));
      }
      
      for (const file of files) {
        try {
          await fs.unlink(file);
          console.log('[YouTube] Cleaned up:', file);
        } catch (error) {
          // ファイルが存在しない場合は無視
        }
      }
    } catch (error) {
      console.error('[YouTube] Error during cleanup:', error);
    }
  }

  // yt-dlpを使用してメタデータを取得
  async getVideoMetadata(youtubeUrl: string): Promise<any> {
    try {
      const command = `yt-dlp -j "${youtubeUrl}"`;
      const output = await this.execCommand(command);
      return JSON.parse(output);
    } catch (error) {
      console.error('[YouTube] Error getting metadata:', error);
      return null;
    }
  }
}