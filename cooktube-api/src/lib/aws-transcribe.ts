import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand, TranscriptionJob } from '@aws-sdk/client-transcribe';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import path from 'path';

export interface TranscriptionResult {
  text: string;
  confidence: number;
  segments: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export class AWSTranscribeService {
  private transcribeClient: TranscribeClient;
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    
    this.transcribeClient = new TranscribeClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    this.bucketName = process.env.AWS_S3_BUCKET || 'cooktube-audio-files';
  }

  private async uploadToS3(filePath: string, key: string): Promise<string> {
    try {
      const fileContent = await fs.readFile(filePath);
      
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: 'audio/mpeg',
      }));

      return `s3://${this.bucketName}/${key}`;
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw new Error('Failed to upload audio to S3');
    }
  }

  private async waitForTranscription(jobName: string): Promise<TranscriptionJob> {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const command = new GetTranscriptionJobCommand({
          TranscriptionJobName: jobName,
        });

        const response = await this.transcribeClient.send(command);
        const job = response.TranscriptionJob;

        if (!job) {
          throw new Error('Transcription job not found');
        }

        if (job.TranscriptionJobStatus === 'COMPLETED') {
          return job;
        }

        if (job.TranscriptionJobStatus === 'FAILED') {
          throw new Error(`Transcription failed: ${job.FailureReason}`);
        }

        // Wait 5 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      } catch (error) {
        console.error('Error checking transcription status:', error);
        throw error;
      }
    }

    throw new Error('Transcription job timed out');
  }

  private async downloadTranscriptionResult(uri: string): Promise<any> {
    try {
      console.log('[Transcribe] Downloading transcription result from URI:', uri);
      
      // Parse S3 URI - handle different formats
      let bucket: string;
      let key: string;
      
      // Try different S3 URI formats
      const s3UriMatch = uri.match(/s3:\/\/([^\/]+)\/(.+)/);
      const httpsS3Match = uri.match(/https:\/\/s3\.amazonaws\.com\/([^\/]+)\/(.+)/);
      const httpsS3RegionMatch = uri.match(/https:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/(.+)/);
      
      if (s3UriMatch) {
        bucket = s3UriMatch[1];
        key = s3UriMatch[2];
        console.log('[Transcribe] Parsed S3 URI format: s3://bucket/key');
      } else if (httpsS3Match) {
        bucket = httpsS3Match[1];
        key = httpsS3Match[2];
        console.log('[Transcribe] Parsed HTTPS S3 format: https://s3.amazonaws.com/bucket/key');
      } else if (httpsS3RegionMatch) {
        bucket = httpsS3RegionMatch[1];
        key = httpsS3RegionMatch[3];
        console.log('[Transcribe] Parsed HTTPS S3 regional format');
      } else {
        console.error('[Transcribe] Unknown URI format:', uri);
        throw new Error(`Invalid S3 URI format: ${uri}`);
      }
      
      console.log('[Transcribe] Parsed bucket:', bucket, 'key:', key);

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const body = await response.Body?.transformToString();
      
      if (!body) {
        throw new Error('Empty transcription result');
      }

      return JSON.parse(body);
    } catch (error) {
      console.error('Error downloading transcription result:', error);
      throw new Error('Failed to download transcription result');
    }
  }

  private parseTranscriptionResult(data: any): TranscriptionResult {
    try {
      const results = data.results;
      const transcript = results.transcripts[0]?.transcript || '';
      
      const segments: TranscriptionSegment[] = [];
      
      if (results.items) {
        let currentSegment = '';
        let segmentStart = 0;
        let segmentEnd = 0;
        let segmentConfidence = 0;
        let itemCount = 0;

        for (const item of results.items) {
          if (item.type === 'pronunciation') {
            const content = item.alternatives[0]?.content || '';
            const confidence = parseFloat(item.alternatives[0]?.confidence || '0');
            const startTime = parseFloat(item.start_time || '0');
            const endTime = parseFloat(item.end_time || '0');

            if (itemCount === 0) {
              segmentStart = startTime;
            }

            currentSegment += content + ' ';
            segmentEnd = endTime;
            segmentConfidence += confidence;
            itemCount++;

            // Create segment every 10 words or at punctuation
            if (itemCount >= 10 || content.match(/[.!?]/)) {
              segments.push({
                text: currentSegment.trim(),
                startTime: segmentStart,
                endTime: segmentEnd,
                confidence: itemCount > 0 ? segmentConfidence / itemCount : 0,
              });

              currentSegment = '';
              itemCount = 0;
              segmentConfidence = 0;
            }
          }
        }

        // Add remaining segment
        if (currentSegment.trim()) {
          segments.push({
            text: currentSegment.trim(),
            startTime: segmentStart,
            endTime: segmentEnd,
            confidence: itemCount > 0 ? segmentConfidence / itemCount : 0,
          });
        }
      }

      // Calculate overall confidence
      const overallConfidence = segments.length > 0 
        ? segments.reduce((sum, seg) => sum + seg.confidence, 0) / segments.length 
        : 0;

      return {
        text: transcript,
        confidence: overallConfidence,
        segments,
      };
    } catch (error) {
      console.error('Error parsing transcription result:', error);
      throw new Error('Failed to parse transcription result');
    }
  }

  async transcribeAudio(audioFilePath: string, videoId: string, languageCode?: string): Promise<TranscriptionResult> {
    try {
      const jobName = `cooktube-${videoId}-${Date.now()}`;
      const s3Key = `audio/${videoId}/${Date.now()}.mp3`;

      // Upload audio to S3
      console.log('[Transcribe] Uploading audio to S3...');
      const s3Uri = await this.uploadToS3(audioFilePath, s3Key);
      console.log('[Transcribe] Audio uploaded to S3:', s3Uri);

      // Determine language - prioritize Japanese for cooking videos
      const targetLanguage = (languageCode || 'ja-JP') as 'ja-JP' | 'en-US';
      console.log('[Transcribe] Using language code:', targetLanguage);

      // Start transcription job with language identification as fallback
      const command = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: targetLanguage,
        MediaFormat: 'mp3',
        Media: {
          MediaFileUri: s3Uri,
        },
        Settings: {
          ShowSpeakerLabels: false,
          ShowAlternatives: true,
          MaxAlternatives: 3,
          // Add vocabulary filtering for cooking terms
          VocabularyFilterName: undefined, // We could add cooking vocabulary later
        },
        OutputBucketName: this.bucketName,
        OutputKey: `transcripts/${videoId}/`,
      });

      await this.transcribeClient.send(command);

      // Wait for completion
      const job = await this.waitForTranscription(jobName);

      // Download and parse result
      if (!job.Transcript?.TranscriptFileUri) {
        throw new Error('Transcription result URI not found');
      }

      const transcriptionData = await this.downloadTranscriptionResult(job.Transcript.TranscriptFileUri);
      const result = this.parseTranscriptionResult(transcriptionData);

      return result;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error('Failed to transcribe audio');
    }
  }
}