import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { TranscriptionResult } from './aws-transcribe';
import { RecognitionResult } from './aws-rekognition';

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

export class AWSBedrockService {
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
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      };

      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(payload),
        contentType: 'application/json',
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
        return responseBody.content[0].text;
      }

      throw new Error('Invalid response format from Bedrock');
    } catch (error) {
      console.error('Error invoking Bedrock model:', error);
      throw new Error('Failed to generate content with AI');
    }
  }

  async generateRecipe(prompt: string): Promise<any> {
    try {
      const response = await this.invokeModel(prompt);
      return this.parseRecipeResponse(response);
    } catch (error) {
      console.error('Error generating recipe:', error);
      throw new Error('Failed to generate recipe');
    }
  }

  async generateRecipeFromAnalysis(
    transcription: TranscriptionResult,
    recognition: RecognitionResult,
    videoTitle: string
  ): Promise<GeneratedRecipe> {
    const prompt = this.buildRecipePrompt(transcription, recognition, videoTitle);

    try {
      const response = await this.invokeModel(prompt);
      return this.parseRecipeResponse(response);
    } catch (error) {
      console.error('Error generating recipe:', error);
      throw new Error('Failed to generate recipe');
    }
  }

  private buildRecipePrompt(
    transcription: TranscriptionResult,
    recognition: RecognitionResult,
    videoTitle: string
  ): string {
    const detectedIngredients = recognition.foodItems.map(item => item.name).join(', ');
    const detectedTools = recognition.cookingTools.map(tool => tool.name).join(', ');
    
    return `
あなたは経験豊富な料理研究家であり、YouTube料理動画の詳細分析のスペシャリストです。以下の情報から、実際に料理できる完全なレシピを詳細に抽出・構築してください。

【動画情報】
タイトル: "${videoTitle}"

【音声転写内容（動画全体で話された全ての内容）】:
"${transcription.text}"

【動画から検出された食材（15フレーム分析結果）】: ${detectedIngredients || '検出なし'}

【動画から検出された調理器具（15フレーム分析結果）】: ${detectedTools || '検出なし'}

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
11. **品質管理**: 出来上がりの見た目、味の目安も記載
12. **代替案の提示**: 材料や器具の代替案も適宜含める

**分析の深度を上げる指示**:
- 転写テキストを単語レベルで精査し、料理関連の全ての情報を抽出
- 検出された食材リストと音声内容を照合し、矛盾や不足を特定
- 調理手順は最低でも8-15ステップに細分化すること
- 各ステップで必要な時間、火力、器具を明記

JSON形式のレスポンスのみを提供し、追加のテキストや説明は不要です。
`;
  }

  private parseRecipeResponse(response: string): GeneratedRecipe {
    try {
      // Clean up the response - remove any markdown formatting or extra text
      let cleanResponse = response.trim();
      
      // Find JSON block if wrapped in markdown
      const jsonMatch = cleanResponse.match(/```json\n([\s\S]*?)\n```/) || cleanResponse.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[1];
      }
      
      // Remove any leading/trailing whitespace and non-JSON characters
      cleanResponse = cleanResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      
      const parsedRecipe = JSON.parse(cleanResponse);
      
      // Validate required fields
      if (!parsedRecipe.title || !parsedRecipe.ingredients || !parsedRecipe.steps) {
        throw new Error('Invalid recipe format: missing required fields');
      }

      // Ensure ingredients have required structure
      parsedRecipe.ingredients = parsedRecipe.ingredients.map((ing: any, index: number) => ({
        name: ing.name || `食材 ${index + 1}`,
        amount: ing.amount || '適量',
        unit: ing.unit || '',
        notes: ing.notes || undefined,
        category: ing.category || 'その他',
      }));

      // Ensure steps have required structure
      parsedRecipe.steps = parsedRecipe.steps.map((step: any, index: number) => ({
        stepNumber: step.stepNumber || index + 1,
        description: step.description || `手順 ${index + 1}`,
        duration: step.duration || undefined,
        temperature: step.temperature || undefined,
        tips: step.tips || undefined,
        tools: step.tools || [],
      }));

      // Set defaults for optional fields
      return {
        title: parsedRecipe.title,
        description: parsedRecipe.description || '動画から自動生成されたレシピです',
        servings: parsedRecipe.servings || 4,
        prepTime: parsedRecipe.prepTime || '15分',
        cookTime: parsedRecipe.cookTime || '30分',
        totalTime: parsedRecipe.totalTime || '45分',
        difficulty: parsedRecipe.difficulty || 'Medium',
        ingredients: parsedRecipe.ingredients,
        steps: parsedRecipe.steps,
        tags: parsedRecipe.tags || [],
        nutritionEstimate: parsedRecipe.nutritionEstimate || {
          calories: 400,
          protein: '20g',
          carbs: '45g',
          fat: '15g',
          fiber: '3g',
          sodium: '2g'
        },
        cookingTips: parsedRecipe.cookingTips || [],
        variations: parsedRecipe.variations || [],
      };
    } catch (error) {
      console.error('Error parsing recipe response:', error);
      console.error('Raw response:', response);
      
      // Fallback recipe if parsing fails
      return {
        title: 'Generated Recipe',
        description: 'Recipe generated from video analysis',
        servings: 4,
        prepTime: '15 minutes',
        cookTime: '30 minutes',
        totalTime: '45 minutes',
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

  async improveRecipe(recipe: GeneratedRecipe, feedback: string): Promise<GeneratedRecipe> {
    const prompt = `
Please improve this recipe based on the following feedback:

CURRENT RECIPE:
${JSON.stringify(recipe, null, 2)}

FEEDBACK:
"${feedback}"

Please provide an improved version of the recipe in the same JSON format, incorporating the feedback while maintaining the recipe structure.

Provide ONLY the JSON response, no additional text.
`;

    try {
      const response = await this.invokeModel(prompt);
      return this.parseRecipeResponse(response);
    } catch (error) {
      console.error('Error improving recipe:', error);
      // Return original recipe if improvement fails
      return recipe;
    }
  }

  async generateRecipeSummary(recipe: GeneratedRecipe): Promise<string> {
    const prompt = `
Create a compelling, concise summary (2-3 sentences) for this recipe that would be perfect for social media sharing:

RECIPE:
${JSON.stringify(recipe, null, 2)}

The summary should be engaging, highlight key ingredients or cooking techniques, and make people want to try the recipe.

Provide only the summary text, no additional formatting.
`;

    try {
      const response = await this.invokeModel(prompt);
      return response.trim();
    } catch (error) {
      console.error('Error generating recipe summary:', error);
      return `Delicious ${recipe.title} with ${recipe.ingredients.length} ingredients. Ready in ${recipe.cookTime}!`;
    }
  }
}