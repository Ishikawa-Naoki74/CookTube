import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import path from 'path';

export class AWSS3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const region = process.env.AWS_REGION || 'ap-northeast-1';
    this.bucketName = process.env.AWS_S3_BUCKET || 'cooktube';
    
    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async uploadFile(filePath: string, key: string, contentType?: string): Promise<string> {
    try {
      console.log(`[S3] Uploading file: ${filePath} → s3://${this.bucketName}/${key}`);

      // ファイルを読み取り
      const fileBuffer = await fs.readFile(filePath);
      
      // S3にアップロード
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType || this.getContentType(filePath),
      });

      await this.s3Client.send(command);
      
      const s3Url = `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'ap-northeast-1'}.amazonaws.com/${key}`;
      console.log(`[S3] Upload completed: ${s3Url}`);
      
      return s3Url;
    } catch (error) {
      console.error('[S3] Upload error:', error);
      throw new Error(`Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      console.log(`[S3] Deleting file: s3://${this.bucketName}/${key}`);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      console.log(`[S3] Delete completed: ${key}`);
    } catch (error) {
      console.error('[S3] Delete error:', error);
      throw new Error(`Failed to delete file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.mp3':
        return 'audio/mpeg';
      case '.mp4':
        return 'video/mp4';
      case '.webm':
        return 'video/webm';
      case '.m4a':
        return 'audio/mp4';
      case '.wav':
        return 'audio/wav';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      default:
        return 'application/octet-stream';
    }
  }

  generateVideoKey(videoId: string, filename: string): string {
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `videos/${videoId}/${timestamp}/${filename}`;
  }

  generateAudioKey(videoId: string, filename: string): string {
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `audio/${videoId}/${timestamp}/${filename}`;
  }

  generateImageKey(videoId: string, filename: string): string {
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `images/${videoId}/${timestamp}/${filename}`;
  }
}