import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { VideoAnalysisResult } from './aws-rekognition-video';
import { TranscriptionResult } from './aws-transcribe';
import { EnhancedRecipeData } from './enhanced-recipe-processor';

export interface IntegratedAnalysisData {
  videoInfo: any;
  videoAnalysis: VideoAnalysisResult;
  transcriptionResult: TranscriptionResult;
  frames: any[];
  integratedTimeline: any[];
}

export class EnhancedBedrockService {
  private bedrockClient: BedrockRuntimeClient;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    
    this.bedrockClient = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  private async invokeModel(prompt: string, modelId: string = 'anthropic.claude-3-5-sonnet-20241022-v2:0'): Promise<string> {
    try {
      const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        top_p: 0.9
      };

      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      return responseBody.content[0].text;
    } catch (error) {
      console.error('Error invoking Bedrock model:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * 統合されたデータからレシピを生成
   */
  async generateEnhancedRecipe(data: IntegratedAnalysisData): Promise<EnhancedRecipeData> {
    const prompt = this.createEnhancedRecipePrompt(data);
    
    try {
      const aiResponse = await this.invokeModel(prompt);
      const parsedRecipe = this.parseEnhancedRecipeResponse(aiResponse, data);
      
      return parsedRecipe;
    } catch (error) {
      console.error('Error generating enhanced recipe:', error);
      throw new Error('Failed to generate recipe');
    }
  }

  /**
   * 拡張レシピ生成用のプロンプトを作成
   */
  private createEnhancedRecipePrompt(data: IntegratedAnalysisData): string {
    const videoTitle = data.videoInfo.title || 'Cooking Video';
    const transcription = data.transcriptionResult.text || '';
    const ingredients = Array.from(data.videoAnalysis.ingredients).join(', ');
    const cookingTools = Array.from(data.videoAnalysis.cookingTools).join(', ');
    
    // タイムライン情報を構造化
    const timelineEvents = data.integratedTimeline.map(event => 
      `${Math.floor(event.timestamp / 60)}:${String(Math.floor(event.timestamp % 60)).padStart(2, '0')} - ${event.type}: ${event.description}`
    ).join('\n');

    // 調理アクションのサマリー
    const cookingActions = data.videoAnalysis.cookingActions.map(action =>
      `${Math.floor(action.timestamp / 60)}:${String(Math.floor(action.timestamp % 60)).padStart(2, '0')} - ${action.action} (使用材料: ${action.ingredients.join(', ') || 'なし'}, 使用器具: ${action.tools.join(', ') || 'なし'})`
    ).join('\n');

    return `
あなたは料理のプロフェッショナルです。YouTube動画から抽出した以下の詳細な情報を基に、構造化されたレシピを生成してください。

## 動画情報
タイトル: ${videoTitle}
時長: ${Math.floor((data.videoAnalysis.labels[data.videoAnalysis.labels.length - 1]?.timestamp || 300) / 60)}分

## 音声テキスト（料理説明）
${transcription}

## 検出された食材
${ingredients}

## 検出された調理器具
${cookingTools}

## 時系列イベント（音声+映像統合）
${timelineEvents}

## 調理アクション分析
${cookingActions}

以下のJSON形式で詳細なレシピを生成してください：

\`\`\`json
{
  "title": "レシピのタイトル",
  "description": "レシピの簡潔な説明（2-3文）",
  "ingredients": [
    {
      "name": "食材名",
      "amount": "分量",
      "unit": "単位",
      "firstAppearance": タイムスタンプ(秒),
      "confidence": 0.0-1.0の信頼度
    }
  ],
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "詳細な手順説明",
      "startTime": 開始タイムスタンプ(秒),
      "endTime": 終了タイムスタンプ(秒),
      "ingredients": ["この工程で使用する食材"],
      "tools": ["この工程で使用する器具"],
      "techniques": ["使用される調理技術"]
    }
  ],
  "cookingTools": ["必要な調理器具のリスト"],
  "estimatedTime": 推定調理時間(分),
  "difficulty": "easy/medium/hard",
  "videoAnalysis": {
    "totalIngredients": 食材数,
    "totalSteps": 手順数,
    "complexityScore": 1-10の複雑さスコア
  }
}
\`\`\`

## 重要な指示：
1. タイムスタンプは実際の動画の時間と一致させてください
2. 検出された食材と音声の両方の情報を統合してください  
3. 曖昧な分量は常識的な範囲で推定してください
4. 手順は時系列順に整理してください
5. 各手順には明確な開始・終了時間を設定してください
6. 日本語で回答してください
7. JSONの形式を厳密に守ってください

レスポンスはJSONブロック内のみで回答してください。
`;
  }

  /**
   * AIレスポンスを解析して構造化データに変換
   */
  private parseEnhancedRecipeResponse(aiResponse: string, originalData: IntegratedAnalysisData): EnhancedRecipeData {
    try {
      // JSONブロックの抽出
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
        throw new Error('No JSON block found in AI response');
      }

      const recipeJson = JSON.parse(jsonMatch[1]);

      // バリデーションと補完
      return {
        title: recipeJson.title || originalData.videoInfo.title || 'Generated Recipe',
        description: recipeJson.description || 'AI generated recipe from video analysis',
        ingredients: recipeJson.ingredients?.map((ing: any) => ({
          name: ing.name,
          amount: ing.amount || '適量',
          unit: ing.unit || '',
          firstAppearance: ing.firstAppearance || 0,
          confidence: ing.confidence || 0.8,
        })) || [],
        steps: recipeJson.steps?.map((step: any) => ({
          stepNumber: step.stepNumber || 1,
          instruction: step.instruction,
          startTime: step.startTime || 0,
          endTime: step.endTime || 0,
          ingredients: step.ingredients || [],
          tools: step.tools || [],
          techniques: step.techniques || [],
        })) || [],
        cookingTools: recipeJson.cookingTools || Array.from(originalData.videoAnalysis.cookingTools),
        estimatedTime: recipeJson.estimatedTime || 30,
        difficulty: recipeJson.difficulty || 'medium',
        videoAnalysis: originalData.videoAnalysis,
        audioTranscription: originalData.transcriptionResult,
      };
    } catch (error) {
      console.error('Error parsing AI recipe response:', error);
      console.log('AI Response:', aiResponse);
      
      // フォールバック: 基本的なレシピ構造を生成
      return this.createFallbackRecipe(originalData);
    }
  }

  /**
   * エラー時のフォールバックレシピ生成
   */
  private createFallbackRecipe(data: IntegratedAnalysisData): EnhancedRecipeData {
    const ingredients = Array.from(data.videoAnalysis.ingredients).map((name, index) => ({
      name,
      amount: '適量',
      unit: '',
      firstAppearance: index * 30,
      confidence: 0.8,
    }));

    const steps = data.videoAnalysis.cookingActions.map((action, index) => ({
      stepNumber: index + 1,
      instruction: `${action.action}を行う${action.ingredients.length > 0 ? ` (使用食材: ${action.ingredients.join(', ')})` : ''}`,
      startTime: action.timestamp,
      endTime: action.timestamp + action.duration,
      ingredients: action.ingredients,
      tools: action.tools,
      techniques: [action.action],
    }));

    return {
      title: data.videoInfo.title || 'Generated Recipe',
      description: '動画から自動生成されたレシピです',
      ingredients,
      steps,
      cookingTools: Array.from(data.videoAnalysis.cookingTools),
      estimatedTime: Math.ceil(data.videoAnalysis.timeline.length * 2),
      difficulty: 'medium' as const,
      videoAnalysis: data.videoAnalysis,
      audioTranscription: data.transcriptionResult,
    };
  }
}