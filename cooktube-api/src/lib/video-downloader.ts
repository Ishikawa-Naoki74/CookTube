import ytdl from 'ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';

export class VideoDownloader {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  async downloadVideo(youtubeUrl: string, videoId: string): Promise<string> {
    try {
      const outputPath = path.join(this.tempDir, `${videoId}.mp4`);
      
      console.log('Downloading video from:', youtubeUrl);
      const stream = ytdl(youtubeUrl, {
        quality: 'lowest',
        filter: 'videoandaudio',
      });

      const writeStream = createWriteStream(outputPath);
      
      return new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        
        writeStream.on('finish', () => {
          console.log('Video downloaded successfully:', outputPath);
          resolve(outputPath);
        });
        
        writeStream.on('error', (error) => {
          console.error('Error downloading video:', error);
          reject(error);
        });
        
        stream.on('error', (error) => {
          console.error('Error with ytdl stream:', error);
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error in downloadVideo:', error);
      throw new Error('Failed to download video');
    }
  }

  async extractAudio(videoPath: string, videoId: string): Promise<string> {
    try {
      const audioPath = path.join(this.tempDir, `${videoId}.mp3`);
      
      console.log('Extracting audio from:', videoPath);
      
      return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .output(audioPath)
          .audioCodec('mp3')
          .on('end', () => {
            console.log('Audio extracted successfully:', audioPath);
            resolve(audioPath);
          })
          .on('error', (error) => {
            console.error('Error extracting audio:', error);
            reject(error);
          })
          .run();
      });
    } catch (error) {
      console.error('Error in extractAudio:', error);
      throw new Error('Failed to extract audio');
    }
  }

  async extractFrames(videoPath: string, videoId: string, count: number = 5): Promise<string[]> {
    try {
      const frames: string[] = [];
      
      console.log('Extracting frames from:', videoPath);
      
      // Get video duration
      const duration = await this.getVideoDuration(videoPath);
      const interval = duration / (count + 1);
      
      for (let i = 1; i <= count; i++) {
        const timestamp = interval * i;
        const framePath = path.join(this.tempDir, `${videoId}_frame_${i}.jpg`);
        
        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .screenshots({
              timestamps: [timestamp],
              filename: `${videoId}_frame_${i}.jpg`,
              folder: this.tempDir,
              size: '640x360',
            })
            .on('end', () => {
              frames.push(framePath);
              resolve(framePath);
            })
            .on('error', reject);
        });
      }
      
      console.log('Frames extracted successfully:', frames);
      return frames;
    } catch (error) {
      console.error('Error extracting frames:', error);
      throw new Error('Failed to extract frames');
    }
  }

  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration || 60);
        }
      });
    });
  }

  async cleanup(videoId: string): Promise<void> {
    try {
      const files = [
        path.join(this.tempDir, `${videoId}.mp4`),
        path.join(this.tempDir, `${videoId}.mp3`),
      ];
      
      // Also cleanup frames
      for (let i = 1; i <= 10; i++) {
        files.push(path.join(this.tempDir, `${videoId}_frame_${i}.jpg`));
      }
      
      for (const file of files) {
        try {
          await fs.unlink(file);
          console.log('Cleaned up:', file);
        } catch (error) {
          // File might not exist, ignore
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}