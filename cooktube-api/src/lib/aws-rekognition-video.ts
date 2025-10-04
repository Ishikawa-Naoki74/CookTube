import {
  RekognitionClient,
  StartLabelDetectionCommand,
  GetLabelDetectionCommand,
  StartSegmentDetectionCommand,
  GetSegmentDetectionCommand,
  DetectLabelsCommand,
  LabelDetectionSortBy,
  SegmentType,
} from '@aws-sdk/client-rekognition';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';

export interface VideoLabel {
  name: string;
  confidence: number;
  timestamp: number;
  categories: string[];
  instances: BoundingBox[];
}

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CookingAction {
  action: string;
  timestamp: number;
  duration: number;
  confidence: number;
  ingredients: string[];
  tools: string[];
}

export interface VideoAnalysisResult {
  labels: VideoLabel[];
  cookingActions: CookingAction[];
  ingredients: Set<string>;
  cookingTools: Set<string>;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  timestamp: number;
  type: 'ingredient' | 'tool' | 'action' | 'technique';
  description: string;
  confidence: number;
}

export class AWSRekognitionVideoService {
  private rekognitionClient: RekognitionClient;
  private s3Client: S3Client;
  private bucketName: string;

  // 料理関連のラベルカテゴリー（拡張版）
  private readonly INGREDIENT_KEYWORDS = [
    'food', 'vegetable', 'fruit', 'meat', 'fish', 'seafood', 'dairy', 'grain', 'spice',
    'herb', 'sauce', 'oil', 'bread', 'pasta', 'rice', 'egg', 'cheese', 'milk',
    'onion', 'garlic', 'ginger', 'carrot', 'potato', 'tomato', 'cucumber',
    'mushroom', 'cabbage', 'spinach', 'lettuce', 'broccoli', 'pepper',
    'chicken', 'beef', 'pork', 'salmon', 'tuna', 'shrimp',
    'tofu', 'miso', 'soy sauce', 'vinegar', 'sugar', 'salt', 'butter',
    'noodle', 'flour', 'corn', 'bean', 'lemon', 'lime', 'apple',
  ];

  private readonly COOKING_TOOL_KEYWORDS = [
    'knife', 'pan', 'pot', 'bowl', 'spoon', 'fork', 'spatula', 'whisk',
    'cutting board', 'chopping board', 'oven', 'stove', 'mixer', 'blender', 'grater',
    'ladle', 'tongs', 'colander', 'strainer', 'peeler', 'can opener',
    'measuring cup', 'scale', 'wok', 'skillet', 'saucepan', 'frying pan',
    'steamer', 'mortar', 'pestle', 'rolling pin', 'baking sheet', 'timer',
  ];

  private readonly COOKING_ACTION_KEYWORDS = [
    'cutting', 'chopping', 'slicing', 'dicing', 'mincing', 'stirring', 'mixing', 'cooking',
    'frying', 'boiling', 'baking', 'grilling', 'roasting', 'sautéing', 'seasoning', 'pouring',
    'whisking', 'kneading', 'steaming', 'simmering', 'marinating', 'peeling', 'washing',
    'measuring', 'heating', 'cooling', 'serving', 'plating', 'garnishing',
  ];

  constructor() {
    const region = process.env.AWS_REGION || 'ap-northeast-1';
    
    this.rekognitionClient = new RekognitionClient({
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

    this.bucketName = process.env.AWS_S3_BUCKET || 'cooktube-media';
  }

  /**
   * 動画をS3にアップロード
   */
  async uploadVideo(videoBuffer: Buffer, key: string): Promise<string> {
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: videoBuffer,
        ContentType: 'video/mp4',
      }));

      return `s3://${this.bucketName}/${key}`;
    } catch (error) {
      console.error('Error uploading video to S3:', error);
      throw new Error('Failed to upload video');
    }
  }

  /**
   * 動画全体のラベル検出を開始
   */
  async startVideoLabelDetection(s3Uri: string): Promise<string> {
    const s3Match = s3Uri.match(/s3:\/\/([^\/]+)\/(.+)/);
    if (!s3Match) {
      throw new Error('Invalid S3 URI');
    }

    const bucket = s3Match[1];
    const key = s3Match[2];

    try {
      const command = new StartLabelDetectionCommand({
        Video: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
        MinConfidence: 70, // 70%以上の確信度のラベルのみ
        ClientRequestToken: `cooktube-${Date.now()}`,
        JobTag: 'CookTubeRecipeAnalysis',
      });

      const response = await this.rekognitionClient.send(command);
      
      if (!response.JobId) {
        throw new Error('Failed to start label detection job');
      }

      return response.JobId;
    } catch (error) {
      console.error('Error starting video label detection:', error);
      throw new Error('Failed to start video analysis');
    }
  }

  /**
   * 動画解析ジョブの完了を待機
   */
  async waitForJobCompletion(jobId: string, maxWaitTime: number = 300000): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5秒ごとにチェック

    while (Date.now() - startTime < maxWaitTime) {
      const command = new GetLabelDetectionCommand({
        JobId: jobId,
        MaxResults: 1, // ステータスチェックのみ
      });

      const response = await this.rekognitionClient.send(command);

      if (response.JobStatus === 'SUCCEEDED') {
        return;
      } else if (response.JobStatus === 'FAILED') {
        throw new Error(`Video analysis failed: ${response.StatusMessage}`);
      }

      // IN_PROGRESSの場合は待機
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Video analysis timed out');
  }

  /**
   * 動画解析結果を取得
   */
  async getVideoAnalysisResults(jobId: string): Promise<VideoAnalysisResult> {
    const allLabels: VideoLabel[] = [];
    let nextToken: string | undefined;

    // ページネーションで全結果を取得
    do {
      const command = new GetLabelDetectionCommand({
        JobId: jobId,
        MaxResults: 1000,
        NextToken: nextToken,
        SortBy: LabelDetectionSortBy.TIMESTAMP,
      });

      const response = await this.rekognitionClient.send(command);
      
      if (response.Labels) {
        for (const label of response.Labels) {
          if (label.Label && label.Timestamp !== undefined) {
            allLabels.push({
              name: label.Label.Name || '',
              confidence: label.Label.Confidence || 0,
              timestamp: label.Timestamp / 1000, // ミリ秒を秒に変換
              categories: label.Label.Categories?.map(c => c.Name || '') || [],
              instances: label.Label.Instances?.map(i => ({
                left: i.BoundingBox?.Left || 0,
                top: i.BoundingBox?.Top || 0,
                width: i.BoundingBox?.Width || 0,
                height: i.BoundingBox?.Height || 0,
              })) || [],
            });
          }
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    // 解析結果を処理
    return this.processVideoLabels(allLabels);
  }

  /**
   * フレーム画像を解析（静止画解析）
   */
  async analyzeFrame(imagePath: string): Promise<any> {
    try {
      const imageBuffer = await fs.readFile(imagePath);
      
      const command = new DetectLabelsCommand({
        Image: {
          Bytes: imageBuffer,
        },
        MaxLabels: 20,
        MinConfidence: 75,
      });

      const response = await this.rekognitionClient.send(command);
      return response.Labels || [];
    } catch (error) {
      console.error('Error analyzing frame:', error);
      return [];
    }
  }

  /**
   * 動画ラベルから料理情報を抽出
   */
  private processVideoLabels(labels: VideoLabel[]): VideoAnalysisResult {
    const ingredients = new Set<string>();
    const cookingTools = new Set<string>();
    const cookingActions: CookingAction[] = [];
    const timeline: TimelineEvent[] = [];

    // タイムスタンプごとにグループ化
    const labelsByTime = new Map<number, VideoLabel[]>();
    
    for (const label of labels) {
      const timeKey = Math.floor(label.timestamp / 5) * 5; // 5秒ごとにグループ化
      
      if (!labelsByTime.has(timeKey)) {
        labelsByTime.set(timeKey, []);
      }
      labelsByTime.get(timeKey)!.push(label);

      // カテゴリー分類
      const labelNameLower = label.name.toLowerCase();
      
      // 食材の検出
      if (this.isIngredient(label)) {
        ingredients.add(label.name);
        timeline.push({
          timestamp: label.timestamp,
          type: 'ingredient',
          description: `${label.name} detected`,
          confidence: label.confidence,
        });
      }

      // 調理器具の検出
      if (this.isCookingTool(label)) {
        cookingTools.add(label.name);
        timeline.push({
          timestamp: label.timestamp,
          type: 'tool',
          description: `Using ${label.name}`,
          confidence: label.confidence,
        });
      }

      // 調理動作の検出
      if (this.isCookingAction(label)) {
        timeline.push({
          timestamp: label.timestamp,
          type: 'action',
          description: label.name,
          confidence: label.confidence,
        });
      }
    }

    // 時系列での調理アクション生成
    for (const [timestamp, timeLabels] of labelsByTime.entries()) {
      const action = this.extractCookingAction(timestamp, timeLabels);
      if (action) {
        cookingActions.push(action);
      }
    }

    // タイムラインをソート
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    return {
      labels,
      cookingActions,
      ingredients,
      cookingTools,
      timeline,
    };
  }

  /**
   * ラベルが食材かどうか判定（改良版）
   */
  private isIngredient(label: VideoLabel): boolean {
    const labelLower = label.name.toLowerCase();
    
    // 信頼度が低い場合は除外
    if (label.confidence < 60) {
      return false;
    }
    
    // カテゴリーチェック（優先度高）
    for (const category of label.categories) {
      const categoryLower = category.toLowerCase();
      if (this.INGREDIENT_KEYWORDS.some(keyword => {
        // 完全一致または部分一致
        return categoryLower === keyword || categoryLower.includes(keyword);
      })) {
        return true;
      }
    }

    // ラベル名チェック（詳細マッチング）
    return this.INGREDIENT_KEYWORDS.some(keyword => {
      // より精密なマッチング
      return labelLower === keyword || 
             labelLower.includes(keyword) || 
             keyword.includes(labelLower);
    });
  }

  /**
   * ラベルが調理器具かどうか判定（改良版）
   */
  private isCookingTool(label: VideoLabel): boolean {
    const labelLower = label.name.toLowerCase();
    
    // 信頼度が低い場合は除外
    if (label.confidence < 65) {
      return false;
    }
    
    // より精密なマッチング
    return this.COOKING_TOOL_KEYWORDS.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      return labelLower === keywordLower || 
             labelLower.includes(keywordLower) ||
             // 単語境界を考慮した部分マッチング
             new RegExp(`\\b${keywordLower}\\b`).test(labelLower);
    });
  }

  /**
   * ラベルが調理動作かどうか判定（改良版）
   */
  private isCookingAction(label: VideoLabel): boolean {
    const labelLower = label.name.toLowerCase();
    
    // 信頼度が低い場合は除外
    if (label.confidence < 70) {
      return false;
    }
    
    // より精密なマッチング
    return this.COOKING_ACTION_KEYWORDS.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      return labelLower === keywordLower || 
             labelLower.includes(keywordLower) ||
             // 動作の動詞形をチェック（例: "cutting" -> "cut"）
             labelLower.includes(keywordLower.replace(/ing$/, '')) ||
             new RegExp(`\\b${keywordLower}\\b`).test(labelLower);
    });
  }

  /**
   * タイムスタンプのラベル群から調理アクションを抽出
   */
  private extractCookingAction(timestamp: number, labels: VideoLabel[]): CookingAction | null {
    const actions = labels.filter(l => this.isCookingAction(l));
    const ingredients = labels.filter(l => this.isIngredient(l)).map(l => l.name);
    const tools = labels.filter(l => this.isCookingTool(l)).map(l => l.name);

    if (actions.length === 0) {
      return null;
    }

    const mainAction = actions.reduce((prev, current) => 
      current.confidence > prev.confidence ? current : prev
    );

    return {
      action: mainAction.name,
      timestamp,
      duration: 5, // 5秒間隔でグループ化しているため
      confidence: mainAction.confidence,
      ingredients,
      tools,
    };
  }

  /**
   * 動画全体を解析する統合メソッド
   * ユーザーが動画を入力すると、内部でRekognition Videoを実行して結果を返す
   */
  async analyzeFullVideo(videoPath: string, videoId: string): Promise<VideoAnalysisResult> {
    try {
      console.log('[RekognitionVideo] Starting full video analysis for:', videoId);
      
      // 1. 動画をS3にアップロード
      console.log('[RekognitionVideo] Uploading video to S3...');
      const videoBuffer = await import('fs').then(fs => fs.promises.readFile(videoPath));
      const s3Key = `videos/analysis/${videoId}/${Date.now()}.mp4`;
      const s3Uri = await this.uploadVideo(videoBuffer, s3Key);
      console.log('[RekognitionVideo] Video uploaded to:', s3Uri);

      // 2. Rekognition Video解析ジョブを開始
      console.log('[RekognitionVideo] Starting label detection job...');
      const jobId = await this.startVideoLabelDetection(s3Uri);
      console.log('[RekognitionVideo] Job started with ID:', jobId);

      // 3. ジョブの完了を待機
      console.log('[RekognitionVideo] Waiting for job completion...');
      await this.waitForJobCompletion(jobId);
      console.log('[RekognitionVideo] Job completed successfully');

      // 4. 結果を取得・処理
      console.log('[RekognitionVideo] Retrieving and processing results...');
      const results = await this.getVideoAnalysisResults(jobId);
      console.log('[RekognitionVideo] Analysis complete. Found:', {
        totalLabels: results.labels.length,
        ingredients: results.ingredients.size,
        cookingTools: results.cookingTools.size,
        cookingActions: results.cookingActions.length,
        timelineEvents: results.timeline.length
      });

      return results;

    } catch (error) {
      console.error('[RekognitionVideo] Full video analysis failed:', error);
      throw new Error(`Video analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 動画解析結果のサマリーを生成
   */
  generateAnalysisSummary(results: VideoAnalysisResult): {
    summary: string;
    detectedIngredients: string[];
    detectedTools: string[];
    keyActions: string[];
    confidenceScore: number;
  } {
    const ingredients = Array.from(results.ingredients);
    const tools = Array.from(results.cookingTools);
    const actions = results.cookingActions.map(action => action.action);

    // 全体的な信頼度スコアを計算
    const averageConfidence = results.labels.length > 0 
      ? results.labels.reduce((sum, label) => sum + label.confidence, 0) / results.labels.length
      : 0;

    const summary = `動画から${ingredients.length}種類の食材、${tools.length}種類の調理器具、${actions.length}個の調理動作を検出しました。全体の信頼度: ${Math.round(averageConfidence)}%`;

    return {
      summary,
      detectedIngredients: ingredients.slice(0, 10), // 上位10個
      detectedTools: tools.slice(0, 10), // 上位10個  
      keyActions: [...new Set(actions)].slice(0, 10), // 重複除去して上位10個
      confidenceScore: averageConfidence,
    };
  }
}