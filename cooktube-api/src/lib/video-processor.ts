import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import ytdl from 'ytdl-core';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface VideoProcessorConfig {
  frameInterval: number;
  maxFrames: number;
  resolution: string;
  format: string;
  quality: number;
  tempDir: string;
  s3Bucket: string;
}

export interface FrameExtractionResult {
  jobId: string;
  totalFrames: number;
  frames: VideoFrame[];
  videoMetadata: VideoInfo;
}

export interface VideoFrame {
  frameNumber: number;
  timestamp: number;
  s3Url: string;
  localPath?: string;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  title?: string;
  thumbnail?: string;
}

export class VideoProcessor {
  private s3Client: S3Client;
  private config: VideoProcessorConfig;

  constructor(config: Partial<VideoProcessorConfig> = {}) {
    this.config = {
      frameInterval: config.frameInterval || 2,
      maxFrames: config.maxFrames || 300,
      resolution: config.resolution || '1280x720',
      format: config.format || 'jpeg',
      quality: config.quality || 85,
      tempDir: config.tempDir || '/tmp/video-frames',
      s3Bucket: config.s3Bucket || process.env.S3_BUCKET || 'cooktube-frames'
    };

    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1'
    });
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.access(this.config.tempDir);
    } catch {
      await fs.mkdir(this.config.tempDir, { recursive: true });
    }
  }

  /**
   * YouTube動画をダウンロードしてフレームを抽出
   */
  async processYouTubeVideo(youtubeUrl: string): Promise<FrameExtractionResult> {
    const jobId = uuidv4();
    const jobDir = path.join(this.config.tempDir, jobId);
    
    try {
      await fs.mkdir(jobDir, { recursive: true });
      
      const videoInfo = await this.getYouTubeVideoInfo(youtubeUrl);
      const videoPath = await this.downloadVideo(youtubeUrl, jobDir);
      const metadata = await this.getVideoMetadata(videoPath);
      metadata.title = videoInfo.title;
      metadata.thumbnail = videoInfo.thumbnail;
      
      // ショート動画の場合はフレーム間隔を短くして詳細に分析
      const isShortVideo = this.isShortVideo(youtubeUrl, metadata);
      if (isShortVideo) {
        console.log('📱 Detected YouTube Shorts video, applying enhanced analysis settings');
        // ショート動画は短いが情報密度が高いため、より詳細な分析を実行
        this.config.frameInterval = 0.5; // 0.5秒間隔でフレーム抽出
        this.config.maxFrames = Math.min(metadata.duration * 2, 120); // 動画の長さに応じて調整
        console.log(`📊 Shorts analysis: ${this.config.maxFrames} frames at ${this.config.frameInterval}s intervals`);
      }
      
      const frames = await this.extractFrames(videoPath, jobDir, metadata);
      const uploadedFrames = await this.uploadFramesToS3(frames, jobId);
      
      await this.cleanup(jobDir);
      
      return {
        jobId,
        totalFrames: uploadedFrames.length,
        frames: uploadedFrames,
        videoMetadata: {
          ...metadata,
          isShortVideo
        }
      };
    } catch (error) {
      await this.cleanup(jobDir).catch(() => {});
      throw error;
    }
  }

  /**
   * ショート動画かどうかを判定
   */
  private isShortVideo(youtubeUrl: string, metadata: VideoInfo): boolean {
    // URLからショート動画を判定
    const urlBasedDetection = youtubeUrl.includes('/shorts/') || youtubeUrl.includes('youtube.com/shorts');
    
    // 動画の長さとアスペクト比からショート動画を判定
    const isShortDuration = metadata.duration <= 60; // 60秒以下
    const isVertical = metadata.height > metadata.width; // 縦長
    
    return urlBasedDetection || (isShortDuration && isVertical);
  }

  private async getYouTubeVideoInfo(youtubeUrl: string): Promise<any> {
    try {
      const info = await ytdl.getInfo(youtubeUrl);
      return {
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        duration: parseInt(info.videoDetails.lengthSeconds)
      };
    } catch (error) {
      console.error('Failed to get video info:', error);
      return {};
    }
  }

  private async downloadVideo(youtubeUrl: string, outputDir: string): Promise<string> {
    const outputPath = path.join(outputDir, 'video.mp4');
    
    return new Promise((resolve, reject) => {
      const stream = ytdl(youtubeUrl, {
        quality: 'highest',
        filter: 'videoandaudio'
      });
      
      const writeStream = require('fs').createWriteStream(outputPath);
      
      stream.pipe(writeStream);
      
      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
      stream.on('error', reject);
    });
  }

  /**
   * 動画のメタデータを取得
   */
  private async getVideoMetadata(videoPath: string): Promise<VideoInfo> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`
      );
      
      const data = JSON.parse(stdout);
      const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
      
      return {
        duration: parseFloat(data.format.duration),
        fps: eval(videoStream.r_frame_rate),
        width: videoStream.width,
        height: videoStream.height
      };
    } catch (error) {
      console.error('Error getting video info:', error);
      throw new Error('Failed to get video information');
    }
  }

  /**
   * 動画からフレームを抽出
   */
  private async extractFrames(
    videoPath: string,
    outputDir: string,
    metadata: VideoInfo
  ): Promise<VideoFrame[]> {
    const frames: VideoFrame[] = [];
    const framesDir = path.join(outputDir, 'frames');
    await fs.mkdir(framesDir, { recursive: true });
    
    const totalFramesToExtract = Math.min(
      Math.floor(metadata.duration / this.config.frameInterval),
      this.config.maxFrames
    );
    
    const fps = 1 / this.config.frameInterval;
    const command = `ffmpeg -i "${videoPath}" -vf "fps=${fps},scale=${this.config.resolution}" -q:v 2 "${framesDir}/frame_%04d.${this.config.format}"`;
    
    await execAsync(command);
    
    const files = await fs.readdir(framesDir);
    const frameFiles = files.filter(f => f.startsWith('frame_')).sort();
    
    for (let i = 0; i < Math.min(frameFiles.length, totalFramesToExtract); i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      frames.push({
        frameNumber: i + 1,
        timestamp: i * this.config.frameInterval,
        s3Url: '',
        localPath: framePath
      });
    }
    
    return frames;
  }

  /**
   * フレームをS3にアップロード
   */
  private async uploadFramesToS3(frames: VideoFrame[], jobId: string): Promise<VideoFrame[]> {
    const uploadedFrames: VideoFrame[] = [];
    
    for (const frame of frames) {
      if (!frame.localPath) continue;
      
      const fileContent = await fs.readFile(frame.localPath);
      const key = `frames/${jobId}/frame_${String(frame.frameNumber).padStart(4, '0')}.${this.config.format}`;
      
      const command = new PutObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: key,
        Body: fileContent,
        ContentType: `image/${this.config.format}`
      });
      
      await this.s3Client.send(command);
      
      uploadedFrames.push({
        ...frame,
        s3Url: `https://${this.config.s3Bucket}.s3.amazonaws.com/${key}`,
        localPath: undefined
      });
    }
    
    return uploadedFrames;
  }

  /**
   * 動的フレーム選択（動きの大きい部分を優先）
   */
  async selectKeyFrames(videoPath: string, outputDir: string): Promise<VideoFrame[]> {
    const scenesDir = path.join(outputDir, 'scenes');
    await fs.mkdir(scenesDir, { recursive: true });
    
    const command = `ffmpeg -i "${videoPath}" -vf "select='gt(scene,0.3)',scale=${this.config.resolution}" -vsync vfr "${scenesDir}/scene_%04d.${this.config.format}"`;
    
    await execAsync(command);
    
    const files = await fs.readdir(scenesDir);
    const frames: VideoFrame[] = [];
    
    for (let i = 0; i < files.length; i++) {
      frames.push({
        frameNumber: i + 1,
        timestamp: 0,
        s3Url: '',
        localPath: path.join(scenesDir, files[i])
      });
    }
    
    return frames;
  }

  /**
   * バッチ処理用のフレーム準備
   */
  async prepareBatchFrames(
    frames: VideoFrame[],
    batchSize: number = 25
  ): Promise<VideoFrame[][]> {
    const batches: VideoFrame[][] = [];
    
    for (let i = 0; i < frames.length; i += batchSize) {
      batches.push(frames.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * 一時ファイルをクリーンアップ
   */
  private async cleanup(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
}