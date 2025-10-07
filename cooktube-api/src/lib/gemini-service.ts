import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface GeneratedRecipe {
  title: string;
  description: string;
  servings: number;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  ingredients: Array<{
    name: string;
    amount: string;
    unit: string;
    notes?: string;
    category?: string;
  }>;
  steps: Array<{
    stepNumber: number;
    description: string;
    duration?: string;
    temperature?: string;
    tips?: string;
    tools?: string[];
  }>;
  tags: string[];
  nutritionEstimate?: {
    calories: number;
    protein: string;
    carbs: string;
    fat: string;
    fiber?: string;
    sodium?: string;
  };
  cookingTips?: string[];
  variations?: string[];
}

export interface DetectedLabel {
  name: string;
  confidence: number;
  category: string;
}

export interface VideoAnalysisResult {
  transcription: string;
  detectedIngredients: string[];
  detectedTools: string[];
  detectedActions: string[];
  confidence: number;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[Gemini] GOOGLE_GEMINI_API_KEY is not set. AI features will be limited.');
    }
    this.genAI = new GoogleGenerativeAI(this.apiKey || 'dummy-key');
  }

  /**
   * YouTube動画をダウンロード
   */
  private async downloadYouTubeVideo(youtubeUrl: string): Promise<string> {
    const tempDir = os.tmpdir();
    const videoId = youtubeUrl.match(/(?:v=|\/)([\w-]{11})/)?.[1];
    const outputPath = path.join(tempDir, `youtube_${videoId}_${Date.now()}.mp4`);

    console.log('[Gemini] Downloading YouTube video:', youtubeUrl);

    try {
      // yt-dlp を使用して動画をダウンロード
      const command = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputPath}" "${youtubeUrl}"`;

      await execAsync(command);

      console.log('[Gemini] Video downloaded to:', outputPath);
      return outputPath;
    } catch (error) {
      console.error('[Gemini] Failed to download video:', error);
      throw new Error('Failed to download YouTube video');
    }
  }

  /**
   * Gemini File APIに動画をアップロード
   * Note: GoogleAIFileManager is not available in current SDK version
   */
  private async uploadVideoToGemini(videoPath: string): Promise<string> {
    throw new Error('Video upload to Gemini is not supported in current implementation');
  }

  /**
   * YouTube動画URLから直接レシピを生成
   */
  async analyzeVideoFromUrl(youtubeUrl: string, videoTitle: string): Promise<{
    transcription: string;
    recipe: GeneratedRecipe;
  }> {
    try {
      console.log('[Gemini] Analyzing video directly from YouTube URL:', youtubeUrl);

      if (!this.apiKey) {
        throw new Error('Gemini API key is not configured');
      }

      // Gemini 2.0 Flash で動画を解析（YouTube URLを直接渡す）
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp'
      });

      const prompt = `
あなたは経験豊富な料理研究家です。このYouTube料理動画を徹底的に分析し、完全なレシピを抽出してください。

【動画タイトル】: ${videoTitle}

以下の情報を抽出してください：
1. 動画で話されている内容（音声転写）
2. 使用されている食材
3. 使用されている調理器具
4. 調理手順

以下のJSON形式で詳細なレシピを生成してください：

{
  "transcription": "動画で話されている全ての内容（日本語に翻訳）",
  "recipe": {
    "title": "レシピタイトル",
    "description": "料理の詳しい説明（2-3文で魅力的に）",
    "servings": 4,
    "prepTime": "15分",
    "cookTime": "30分",
    "totalTime": "45分",
    "difficulty": "Easy|Medium|Hard",
    "ingredients": [
      {
        "name": "食材名",
        "amount": "100",
        "unit": "g",
        "notes": "詳しい説明や代替案があれば記載",
        "category": "メイン食材|調味料|その他"
      }
    ],
    "steps": [
      {
        "stepNumber": 1,
        "description": "具体的で詳細な手順説明。火加減、時間、見た目の変化なども含める",
        "duration": "5分",
        "temperature": "中火",
        "tips": "成功のコツ、注意点、失敗しやすいポイント",
        "tools": ["使用する調理器具"]
      }
    ],
    "tags": ["料理ジャンル", "食事の種類", "特徴"],
    "nutritionEstimate": {
      "calories": 400,
      "protein": "25g",
      "carbs": "45g",
      "fat": "15g",
      "fiber": "5g",
      "sodium": "2g"
    },
    "cookingTips": [
      "全体的な調理のコツ",
      "美味しく作るポイント",
      "保存方法"
    ],
    "variations": [
      "アレンジ方法や代替案"
    ]
  }
}

【重要な分析要件】:
1. **音声転写**: 動画で話されている全ての内容を正確に文字起こし
2. **材料の完全抽出**: 動画内で言及・表示された全ての材料を抽出（メイン食材、調味料、隠し味まで）
3. **分量の正確推定**: 音声や画面で述べられた分量を正確に解析
4. **調理手順の細分化**: 動画の調理プロセスを時系列で詳細に抽出
5. **視覚情報の活用**: 画面に映る食材・器具・調理動作を全て認識
6. **実用性の確保**: 家庭で再現可能な具体的な手順とする

JSON形式のレスポンスのみを提供してください。追加のテキストや説明は不要です。
`;

      const result = await model.generateContent([
        prompt,
        {
          fileData: {
            mimeType: 'video/*',
            fileUri: youtubeUrl
          }
        }
      ]);

      const response = result.response;
      const text = response.text();

      console.log('[Gemini] Raw response:', text);

      // JSONをパース
      const parsedResult = this.parseVideoAnalysisResponse(text);

      return {
        transcription: parsedResult.transcription,
        recipe: parsedResult.recipe
      };

    } catch (error) {
      console.error('[Gemini] Video analysis error:', error);
      throw new Error(`Failed to analyze video with Gemini: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 画像から食材・調理器具を認識
   */
  async analyzeImage(imagePath: string): Promise<DetectedLabel[]> {
    try {
      console.log('[Gemini] Analyzing image:', imagePath);

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp'
      });

      const imageData = await fs.readFile(imagePath);
      const base64Image = imageData.toString('base64');

      const prompt = `
この料理画像を分析し、以下をJSON配列形式で抽出してください：

1. 食材（野菜、肉、魚、調味料など）
2. 調理器具（フライパン、鍋、包丁、まな板など）
3. 料理の状態や調理動作

以下のJSON形式で返してください：

[
  {
    "name": "検出されたアイテム名（日本語）",
    "confidence": 95,
    "category": "食材|調理器具|調理動作"
  }
]

JSON配列のみを返してください。説明文は不要です。
`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image
          }
        }
      ]);

      const response = result.response;
      const text = response.text();

      console.log('[Gemini] Image analysis response:', text);

      return this.parseLabelsResponse(text);

    } catch (error) {
      console.error('[Gemini] Image analysis error:', error);
      return [];
    }
  }

  /**
   * 音声文字起こし + 画像認識結果からレシピを生成
   */
  async generateRecipeFromAnalysis(
    transcription: string,
    detectedLabels: string[],
    videoTitle: string,
    videoDescription?: string
  ): Promise<GeneratedRecipe> {
    try {
      console.log('[Gemini] Generating recipe from analysis');

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp'
      });

      const prompt = this.buildRecipePrompt(
        transcription,
        detectedLabels,
        videoTitle,
        videoDescription
      );

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      console.log('[Gemini] Recipe generation response:', text);

      return this.parseRecipeResponse(text);

    } catch (error) {
      console.error('[Gemini] Recipe generation error:', error);
      throw new Error('Failed to generate recipe with Gemini');
    }
  }

  /**
   * レシピ生成用のプロンプトを構築
   */
  private buildRecipePrompt(
    transcription: string,
    detectedLabels: string[],
    videoTitle: string,
    videoDescription?: string
  ): string {
    return `
あなたは経験豊富な料理研究家であり、YouTube料理動画の詳細分析のスペシャリストです。以下の情報から、実際に料理できる完全なレシピを詳細に抽出・構築してください。

【動画情報】
タイトル: "${videoTitle}"
${videoDescription ? `説明: "${videoDescription}"` : ''}

【音声転写内容（動画全体で話された全ての内容）】:
"${transcription}"

【動画から検出された食材・器具】: ${detectedLabels.join(', ') || '検出なし'}

以下のJSON形式で完全なレシピを作成してください。JSONが有効で適切にフォーマットされていることを確認してください：

{
  "title": "レシピタイトル",
  "description": "料理の詳しい説明（2-3文で魅力的に）",
  "servings": 4,
  "prepTime": "15分",
  "cookTime": "30分",
  "totalTime": "45分",
  "difficulty": "Easy|Medium|Hard",
  "ingredients": [
    {
      "name": "食材名",
      "amount": "100",
      "unit": "g",
      "notes": "詳しい説明や代替案があれば記載",
      "category": "メイン食材|調味料|その他"
    }
  ],
  "steps": [
    {
      "stepNumber": 1,
      "description": "具体的で詳細な手順説明。火加減、時間、見た目の変化なども含める",
      "duration": "5分",
      "temperature": "中火",
      "tips": "成功のコツ、注意点、失敗しやすいポイント",
      "tools": ["使用する調理器具"]
    }
  ],
  "tags": ["料理ジャンル", "食事の種類", "特徴"],
  "nutritionEstimate": {
    "calories": 400,
    "protein": "25g",
    "carbs": "45g",
    "fat": "15g",
    "fiber": "5g",
    "sodium": "2g"
  },
  "cookingTips": [
    "全体的な調理のコツ",
    "美味しく作るポイント",
    "保存方法"
  ],
  "variations": [
    "アレンジ方法や代替案"
  ]
}

【重要な分析・抽出要件】:
1. **材料の完全抽出**: 転写内容を詳細に分析し、言及された全ての材料を抽出する（メイン食材、調味料、隠し味まで）
2. **分量の正確推定**: 音声で述べられた分量表現を正確に解析（「少々」「ひとつまみ」「たっぷり」等も具体的な数値に変換）
3. **調理手順の細分化**: 転写内容から調理プロセスを時系列で詳細に抽出し、見落とされがちな細かい工程も含める
4. **火加減・温度の特定**: 音声から火力調整、温度設定、加熱時間を正確に抽出する
5. **調理テクニックの抽出**: 動画制作者が使用した特殊な技法、コツ、注意点を見逃さない
6. **下処理工程の詳述**: 材料の下ごしらえ、準備作業も手順として詳細に記載
7. **タイミングの明確化**: 「同時に」「その間に」等の並行作業も適切に構造化
8. **視覚情報との統合**: 検出された食材・器具情報を音声情報と照合し、不足している材料を補完
9. **実用性の確保**: 家庭で再現可能な具体的な手順とする
10. **初心者配慮**: 専門用語の説明、基本的な調理知識も含める

JSON形式のレスポンスのみを提供し、追加のテキストや説明は不要です。
`;
  }

  /**
   * 動画解析レスポンスをパース
   */
  private parseVideoAnalysisResponse(response: string): {
    transcription: string;
    recipe: GeneratedRecipe;
  } {
    try {
      // Clean up the response - remove markdown formatting
      let cleanResponse = response.trim();

      const jsonMatch = cleanResponse.match(/```json\n([\s\S]*?)\n```/) || cleanResponse.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[1];
      }

      cleanResponse = cleanResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');

      const parsed = JSON.parse(cleanResponse);

      return {
        transcription: parsed.transcription || '',
        recipe: this.normalizeRecipe(parsed.recipe)
      };
    } catch (error) {
      console.error('[Gemini] Failed to parse video analysis response:', error);
      throw new Error('Failed to parse Gemini video analysis response');
    }
  }

  /**
   * レシピレスポンスをパース
   */
  private parseRecipeResponse(response: string): GeneratedRecipe {
    try {
      // Clean up the response - remove markdown formatting
      let cleanResponse = response.trim();

      const jsonMatch = cleanResponse.match(/```json\n([\s\S]*?)\n```/) || cleanResponse.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[1];
      }

      cleanResponse = cleanResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');

      const parsedRecipe = JSON.parse(cleanResponse);

      return this.normalizeRecipe(parsedRecipe);
    } catch (error) {
      console.error('[Gemini] Failed to parse recipe response:', error);

      // Fallback recipe
      return {
        title: 'Generated Recipe',
        description: 'Recipe generated from video analysis',
        servings: 4,
        prepTime: '15分',
        cookTime: '30分',
        totalTime: '45分',
        difficulty: 'Medium',
        ingredients: [
          {
            name: 'Ingredients from video',
            amount: 'As needed',
            unit: '',
          },
        ],
        steps: [
          {
            stepNumber: 1,
            description: 'Follow the instructions from the video',
          },
        ],
        tags: ['video-recipe'],
      };
    }
  }

  /**
   * ラベルレスポンスをパース
   */
  private parseLabelsResponse(response: string): DetectedLabel[] {
    try {
      let cleanResponse = response.trim();

      const jsonMatch = cleanResponse.match(/```json\n([\s\S]*?)\n```/) || cleanResponse.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[1];
      }

      cleanResponse = cleanResponse.replace(/^[^\[]*/, '').replace(/[^\]]*$/, '');

      const labels = JSON.parse(cleanResponse);

      if (!Array.isArray(labels)) {
        return [];
      }

      return labels.map((label: any) => ({
        name: label.name || 'Unknown',
        confidence: label.confidence || 0,
        category: label.category || 'General',
      }));
    } catch (error) {
      console.error('[Gemini] Failed to parse labels response:', error);
      return [];
    }
  }

  /**
   * レシピを正規化
   */
  private normalizeRecipe(recipe: any): GeneratedRecipe {
    // Validate required fields
    if (!recipe.title || !recipe.ingredients || !recipe.steps) {
      throw new Error('Invalid recipe format: missing required fields');
    }

    // Ensure ingredients have required structure
    const ingredients = recipe.ingredients.map((ing: any, index: number) => ({
      name: ing.name || `食材 ${index + 1}`,
      amount: ing.amount || '適量',
      unit: ing.unit || '',
      notes: ing.notes || undefined,
      category: ing.category || 'その他',
    }));

    // Ensure steps have required structure
    const steps = recipe.steps.map((step: any, index: number) => ({
      stepNumber: step.stepNumber || index + 1,
      description: step.description || `手順 ${index + 1}`,
      duration: step.duration || undefined,
      temperature: step.temperature || undefined,
      tips: step.tips || undefined,
      tools: step.tools || [],
    }));

    return {
      title: recipe.title,
      description: recipe.description || '動画から自動生成されたレシピです',
      servings: recipe.servings || 4,
      prepTime: recipe.prepTime || '15分',
      cookTime: recipe.cookTime || '30分',
      totalTime: recipe.totalTime || '45分',
      difficulty: recipe.difficulty || 'Medium',
      ingredients,
      steps,
      tags: recipe.tags || [],
      nutritionEstimate: recipe.nutritionEstimate || {
        calories: 400,
        protein: '20g',
        carbs: '45g',
        fat: '15g',
        fiber: '3g',
        sodium: '2g'
      },
      cookingTips: recipe.cookingTips || [],
      variations: recipe.variations || [],
    };
  }

  /**
   * レシピの改善提案を生成
   */
  async improveRecipe(recipe: GeneratedRecipe, feedback: string): Promise<GeneratedRecipe> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp'
      });

      const prompt = `
以下のレシピを、ユーザーのフィードバックに基づいて改善してください：

【現在のレシピ】:
${JSON.stringify(recipe, null, 2)}

【ユーザーのフィードバック】:
"${feedback}"

改善されたレシピを同じJSON形式で提供してください。フィードバックを反映しつつ、レシピの構造を維持してください。

JSON形式のレスポンスのみを提供してください。
`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return this.parseRecipeResponse(text);
    } catch (error) {
      console.error('[Gemini] Recipe improvement error:', error);
      return recipe;
    }
  }

  /**
   * レシピのサマリーを生成
   */
  async generateRecipeSummary(recipe: GeneratedRecipe): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp'
      });

      const prompt = `
このレシピの魅力的な短文サマリー（2-3文）を作成してください。SNSでシェアするのに最適な内容にしてください：

【レシピ】:
${JSON.stringify(recipe, null, 2)}

サマリーは、主要な食材や調理技法を強調し、人々がこのレシピを試したくなるようにしてください。

サマリーテキストのみを提供してください。追加のフォーマットは不要です。
`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return text.trim();
    } catch (error) {
      console.error('[Gemini] Summary generation error:', error);
      return `美味しい${recipe.title}のレシピです。${recipe.ingredients.length}種類の材料で、${recipe.cookTime}で完成！`;
    }
  }
}
