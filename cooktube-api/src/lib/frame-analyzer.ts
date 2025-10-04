import {
  RekognitionClient,
  DetectLabelsCommand,
  DetectTextCommand,
  DetectCustomLabelsCommand,
  DetectLabelsCommandInput,
  DetectTextCommandInput,
  DetectCustomLabelsCommandInput,
  Label,
  TextDetection,
  CustomLabel
} from '@aws-sdk/client-rekognition';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { VideoFrame } from './video-processor';

export interface FrameAnalysisResult {
  frameNumber: number;
  timestamp: number;
  detectedIngredients: Ingredient[];
  detectedTools: Tool[];
  detectedActions: CookingAction[];
  detectedText: string[];
  confidenceScores: ConfidenceScores;
}

export interface Ingredient {
  name: string;
  confidence: number;
  boundingBox?: BoundingBox;
  category?: string;
}

export interface Tool {
  name: string;
  confidence: number;
  boundingBox?: BoundingBox;
  type?: string;
}

export interface CookingAction {
  action: string;
  confidence: number;
  relatedIngredients?: Ingredient[];
  relatedTools?: Tool[];
}

export interface TimeSeriesAnalysisResult {
  timeline: FrameAnalysisResult[];
  cookingSequence: CookingStep[];
  ingredientProgression: IngredientProgression[];
  toolUsagePattern: ToolUsagePattern[];
}

export interface CookingStep {
  stepNumber: number;
  timestamp: number;
  duration: number;
  primaryAction: string;
  ingredients: string[];
  tools: string[];
  confidence: number;
  description: string;
}

export interface IngredientProgression {
  ingredient: string;
  appearances: Array<{
    timestamp: number;
    confidence: number;
    state: 'raw' | 'processed' | 'cooked' | 'final';
  }>;
}

export interface ToolUsagePattern {
  tool: string;
  usageSegments: Array<{
    startTime: number;
    endTime: number;
    confidence: number;
    relatedActions: string[];
  }>;
}

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ConfidenceScores {
  overall: number;
  ingredients: number;
  tools: number;
  actions: number;
}

export interface FrameAnalyzerConfig {
  rekognitionRegion: string;
  bedrockRegion: string;
  customLabelsProjectArn?: string;
  minConfidence: number;
  maxLabels: number;
}

// 食材関連のラベルマッピング
const INGREDIENT_KEYWORDS = [
  'vegetable', 'fruit', 'meat', 'fish', 'seafood', 'dairy', 'grain',
  'herb', 'spice', 'bread', 'pasta', 'rice', 'egg', 'cheese', 'milk',
  'tomato', 'onion', 'garlic', 'carrot', 'potato', 'chicken', 'beef',
  'pork', 'salmon', 'tuna', 'shrimp', 'butter', 'oil', 'salt', 'pepper'
];

// 調理器具関連のラベルマッピング
const TOOL_KEYWORDS = [
  'knife', 'cutting board', 'pan', 'pot', 'spatula', 'spoon', 'fork',
  'bowl', 'plate', 'oven', 'stove', 'mixer', 'blender', 'whisk',
  'ladle', 'tongs', 'peeler', 'grater', 'colander', 'measuring cup'
];

// 調理アクション関連のラベルマッピング
const ACTION_KEYWORDS = [
  'cutting', 'chopping', 'slicing', 'dicing', 'mincing',
  'cooking', 'frying', 'boiling', 'steaming', 'baking', 'grilling',
  'mixing', 'stirring', 'whisking', 'folding', 'blending',
  'washing', 'peeling', 'draining', 'marinating', 'seasoning',
  'serving', 'plating', 'garnishing', 'arranging'
];

export class FrameAnalyzer {
  private rekognitionClient: RekognitionClient;
  private bedrockClient: BedrockRuntimeClient;
  private config: FrameAnalyzerConfig;

  constructor(config: Partial<FrameAnalyzerConfig> = {}) {
    this.config = {
      rekognitionRegion: config.rekognitionRegion || process.env.AWS_REGION || 'us-east-1',
      bedrockRegion: config.bedrockRegion || process.env.AWS_REGION || 'us-east-1',
      customLabelsProjectArn: config.customLabelsProjectArn,
      minConfidence: config.minConfidence || 70,
      maxLabels: config.maxLabels || 50
    };

    this.rekognitionClient = new RekognitionClient({
      region: this.config.rekognitionRegion
    });

    this.bedrockClient = new BedrockRuntimeClient({
      region: this.config.bedrockRegion
    });
  }

  /**
   * フレームを分析して食材・道具・アクションを検出
   */
  async analyzeFrame(frame: VideoFrame, imageBytes: Buffer, isShortVideo: boolean = false): Promise<FrameAnalysisResult> {
    // ショート動画の場合はより詳細な分析を実行
    const analysisPromises = [
      this.detectGeneralLabels(imageBytes),
      this.config.customLabelsProjectArn ? this.detectCustomLabels(imageBytes) : [],
      this.detectText(imageBytes)
    ];

    // ショート動画の場合は追加の分析も並行実行
    if (isShortVideo) {
      console.log(`🔍 Enhanced analysis for Shorts frame ${frame.frameNumber} at ${frame.timestamp}s`);
      // 追加の詳細分析が必要な場合はここに追加
    }

    const [labels, customLabels, textDetections] = await Promise.all(analysisPromises);

    // ラベルを分類
    const ingredients = this.extractIngredients(labels, customLabels, isShortVideo);
    const tools = this.extractTools(labels, customLabels, isShortVideo);
    const actions = await this.inferCookingActions(labels, ingredients, tools, isShortVideo);

    // 信頼度スコアを計算
    const confidenceScores = this.calculateConfidenceScores(ingredients, tools, actions);

    return {
      frameNumber: frame.frameNumber,
      timestamp: frame.timestamp,
      detectedIngredients: ingredients,
      detectedTools: tools,
      detectedActions: actions,
      detectedText: textDetections.map(t => t.DetectedText || '').filter(t => t),
      confidenceScores
    };
  }

  /**
   * バッチでフレームを分析
   */
  async analyzeBatch(frames: VideoFrame[], imageBuffers: Buffer[]): Promise<FrameAnalysisResult[]> {
    const results: FrameAnalysisResult[] = [];
    
    // 並列処理（最大5つずつ）
    const batchSize = 5;
    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);
      const buffers = imageBuffers.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map((frame, idx) => this.analyzeFrame(frame, buffers[idx]))
      );
      
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Rekognitionで一般的なラベルを検出
   */
  private async detectGeneralLabels(imageBytes: Buffer): Promise<Label[]> {
    const params: DetectLabelsCommandInput = {
      Image: { Bytes: imageBytes },
      MaxLabels: this.config.maxLabels,
      MinConfidence: this.config.minConfidence
    };

    try {
      const command = new DetectLabelsCommand(params);
      const response = await this.rekognitionClient.send(command);
      return response.Labels || [];
    } catch (error) {
      console.error('Error detecting labels:', error);
      return [];
    }
  }

  /**
   * Custom Labelsで食材専用モデルを使用
   */
  private async detectCustomLabels(imageBytes: Buffer): Promise<CustomLabel[]> {
    if (!this.config.customLabelsProjectArn) return [];

    const params: DetectCustomLabelsCommandInput = {
      Image: { Bytes: imageBytes },
      ProjectVersionArn: this.config.customLabelsProjectArn,
      MinConfidence: this.config.minConfidence
    };

    try {
      const command = new DetectCustomLabelsCommand(params);
      const response = await this.rekognitionClient.send(command);
      return response.CustomLabels || [];
    } catch (error) {
      console.error('Error detecting custom labels:', error);
      return [];
    }
  }

  /**
   * テキスト検出（レシピカードや材料リストなど）
   */
  private async detectText(imageBytes: Buffer): Promise<TextDetection[]> {
    const params: DetectTextCommandInput = {
      Image: { Bytes: imageBytes }
    };

    try {
      const command = new DetectTextCommand(params);
      const response = await this.rekognitionClient.send(command);
      return response.TextDetections || [];
    } catch (error) {
      console.error('Error detecting text:', error);
      return [];
    }
  }

  /**
   * ラベルから食材を抽出（ショート動画対応強化）
   */
  private extractIngredients(labels: Label[], customLabels: CustomLabel[], isShortVideo: boolean = false): Ingredient[] {
    const ingredients: Ingredient[] = [];
    const seen = new Set<string>();

    // ショート動画の場合は信頼度のしきい値を下げてより多くの食材を検出
    const confidenceThreshold = isShortVideo ? 55 : 70;

    // 一般ラベルから食材を抽出
    for (const label of labels) {
      const name = label.Name?.toLowerCase() || '';
      const confidence = label.Confidence || 0;
      
      if (confidence >= confidenceThreshold && 
          (INGREDIENT_KEYWORDS.some(keyword => name.includes(keyword)) ||
           this.isLikelyFoodItem(name))) {
        if (!seen.has(name)) {
          seen.add(name);
          ingredients.push({
            name: label.Name || '',
            confidence,
            boundingBox: this.convertBoundingBox(label.Instances?.[0]?.BoundingBox),
            category: this.categorizeIngredient(name)
          });
        }
      }
    }

    // カスタムラベルから食材を追加
    for (const customLabel of customLabels) {
      const name = customLabel.Name?.toLowerCase() || '';
      const confidence = customLabel.Confidence || 0;
      
      if (confidence >= confidenceThreshold && !seen.has(name)) {
        seen.add(name);
        ingredients.push({
          name: customLabel.Name || '',
          confidence,
          boundingBox: this.convertBoundingBox(customLabel.Geometry?.BoundingBox),
          category: this.categorizeIngredient(name)
        });
      }
    }

    // ショート動画の場合は、より幅広い食材検出のために追加チェック
    if (isShortVideo) {
      const additionalIngredients = this.detectAdditionalFoodItems(labels, seen);
      ingredients.push(...additionalIngredients);
    }

    return ingredients.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 追加の食材検出（ショート動画用）
   */
  private detectAdditionalFoodItems(labels: Label[], seen: Set<string>): Ingredient[] {
    const additionalIngredients: Ingredient[] = [];
    const foodRelatedTerms = [
      'dish', 'meal', 'cuisine', 'plate', 'bowl', 'cooking', 'food', 'snack',
      'breakfast', 'lunch', 'dinner', 'recipe', 'ingredient', 'sauce', 'soup',
      'salad', 'sandwich', 'pasta', 'pizza', 'bread', 'cake', 'dessert'
    ];

    for (const label of labels) {
      const name = label.Name?.toLowerCase() || '';
      const confidence = label.Confidence || 0;
      
      if (confidence >= 50 && !seen.has(name) &&
          foodRelatedTerms.some(term => name.includes(term))) {
        additionalIngredients.push({
          name: label.Name || '',
          confidence,
          boundingBox: this.convertBoundingBox(label.Instances?.[0]?.BoundingBox),
          category: 'general'
        });
      }
    }

    return additionalIngredients;
  }

  /**
   * 食品らしいアイテムかどうかを判定
   */
  private isLikelyFoodItem(name: string): boolean {
    const foodIndicators = [
      'fresh', 'raw', 'cooked', 'fried', 'baked', 'roasted', 'grilled',
      'chopped', 'sliced', 'diced', 'minced', 'organic', 'natural',
      'homemade', 'recipe', 'ingredient', 'seasoning', 'flavor'
    ];

    return foodIndicators.some(indicator => name.includes(indicator));
  }

  /**
   * ラベルから調理器具を抽出（ショート動画対応強化）
   */
  private extractTools(labels: Label[], customLabels: CustomLabel[], isShortVideo: boolean = false): Tool[] {
    const tools: Tool[] = [];
    const seen = new Set<string>();

    // ショート動画の場合は信頼度のしきい値を下げる
    const confidenceThreshold = isShortVideo ? 55 : 70;

    for (const label of labels) {
      const name = label.Name?.toLowerCase() || '';
      const confidence = label.Confidence || 0;
      
      if (confidence >= confidenceThreshold &&
          (TOOL_KEYWORDS.some(keyword => name.includes(keyword)) ||
           this.isLikelyCookingTool(name))) {
        if (!seen.has(name)) {
          seen.add(name);
          tools.push({
            name: label.Name || '',
            confidence,
            boundingBox: this.convertBoundingBox(label.Instances?.[0]?.BoundingBox),
            type: this.categorizeTool(name)
          });
        }
      }
    }

    // ショート動画の場合は追加の調理器具検出
    if (isShortVideo) {
      const additionalTools = this.detectAdditionalCookingTools(labels, seen);
      tools.push(...additionalTools);
    }

    return tools.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 調理器具らしいアイテムかどうかを判定
   */
  private isLikelyCookingTool(name: string): boolean {
    const toolIndicators = [
      'kitchen', 'utensil', 'appliance', 'cookware', 'bakeware',
      'cutlery', 'tableware', 'equipment', 'gadget', 'tool'
    ];

    return toolIndicators.some(indicator => name.includes(indicator));
  }

  /**
   * 追加の調理器具検出（ショート動画用）
   */
  private detectAdditionalCookingTools(labels: Label[], seen: Set<string>): Tool[] {
    const additionalTools: Tool[] = [];
    const toolRelatedTerms = [
      'container', 'vessel', 'holder', 'rack', 'stand', 'board',
      'mat', 'towel', 'glove', 'mitt', 'apron', 'timer'
    ];

    for (const label of labels) {
      const name = label.Name?.toLowerCase() || '';
      const confidence = label.Confidence || 0;
      
      if (confidence >= 50 && !seen.has(name) &&
          toolRelatedTerms.some(term => name.includes(term))) {
        additionalTools.push({
          name: label.Name || '',
          confidence,
          boundingBox: this.convertBoundingBox(label.Instances?.[0]?.BoundingBox),
          type: 'accessory'
        });
      }
    }

    return additionalTools;
  }

  /**
   * 調理アクションを推論（ショート動画対応強化）
   */
  private async inferCookingActions(
    labels: Label[],
    ingredients: Ingredient[],
    tools: Tool[],
    isShortVideo: boolean = false
  ): Promise<CookingAction[]> {
    const actions: CookingAction[] = [];
    
    // ショート動画の場合は信頼度のしきい値を下げる
    const confidenceThreshold = isShortVideo ? 50 : 70;
    
    // ラベルから直接アクションを検出
    for (const label of labels) {
      const name = label.Name?.toLowerCase() || '';
      const confidence = label.Confidence || 0;
      
      if (confidence >= confidenceThreshold &&
          ACTION_KEYWORDS.some(keyword => name.includes(keyword))) {
        actions.push({
          action: label.Name || '',
          confidence,
          relatedIngredients: this.findRelatedIngredients(name, ingredients),
          relatedTools: this.findRelatedTools(name, tools)
        });
      }
    }

    // ショート動画用の追加アクション検出
    if (isShortVideo) {
      const additionalActions = this.detectAdditionalActions(labels, ingredients, tools);
      actions.push(...additionalActions);
    }

    // コンテキストベースでアクションを推論
    if (ingredients.length > 0 && tools.length > 0) {
      const inferredActions = this.inferActionsFromContext(ingredients, tools, isShortVideo);
      actions.push(...inferredActions);
    }

    return actions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * ショート動画用の追加アクション検出
   */
  private detectAdditionalActions(labels: Label[], ingredients: Ingredient[], tools: Tool[]): CookingAction[] {
    const actions: CookingAction[] = [];
    const actionRelatedTerms = [
      'hand', 'finger', 'motion', 'movement', 'gesture', 'stirring', 'mixing',
      'pouring', 'adding', 'combining', 'heating', 'cooking', 'preparing'
    ];

    for (const label of labels) {
      const name = label.Name?.toLowerCase() || '';
      const confidence = label.Confidence || 0;
      
      if (confidence >= 45 && 
          actionRelatedTerms.some(term => name.includes(term))) {
        // 動作に関連する食材と器具を推論
        const relatedIngredients = ingredients.slice(0, 2); // 上位2つの食材
        const relatedTools = tools.slice(0, 1); // 上位1つの器具
        
        actions.push({
          action: this.interpretActionFromLabel(name),
          confidence: confidence * 0.8, // 推論なので信頼度を少し下げる
          relatedIngredients,
          relatedTools
        });
      }
    }

    return actions;
  }

  /**
   * ラベルから具体的な調理アクションを解釈
   */
  private interpretActionFromLabel(labelName: string): string {
    if (labelName.includes('hand') || labelName.includes('finger')) return 'mixing';
    if (labelName.includes('motion') || labelName.includes('movement')) return 'stirring';
    if (labelName.includes('gesture')) return 'seasoning';
    if (labelName.includes('pouring')) return 'pouring';
    if (labelName.includes('heating')) return 'cooking';
    return 'preparing';
  }

  /**
   * コンテキストからアクションを推論（ショート動画対応強化）
   */
  private inferActionsFromContext(ingredients: Ingredient[], tools: Tool[], isShortVideo: boolean = false): CookingAction[] {
    const actions: CookingAction[] = [];

    // ショート動画の場合は、より積極的に推論する
    const baseConfidence = isShortVideo ? 70 : 85;

    // ナイフ + 野菜 = カット
    if (tools.some(t => t.name.toLowerCase().includes('knife')) &&
        ingredients.some(i => i.category === 'vegetable')) {
      actions.push({
        action: 'Cutting vegetables',
        confidence: baseConfidence,
        relatedIngredients: ingredients.filter(i => i.category === 'vegetable'),
        relatedTools: tools.filter(t => t.name.toLowerCase().includes('knife'))
      });
    }

    // フライパン + 肉/野菜 = 炒める
    if (tools.some(t => t.name.toLowerCase().includes('pan')) &&
        ingredients.some(i => ['meat', 'vegetable'].includes(i.category || ''))) {
      actions.push({
        action: 'Frying',
        confidence: baseConfidence - 5,
        relatedIngredients: ingredients.filter(i => ['meat', 'vegetable'].includes(i.category || '')),
        relatedTools: tools.filter(t => t.name.toLowerCase().includes('pan'))
      });
    }

    // ボウル + 複数の材料 = 混ぜる
    if (tools.some(t => t.name.toLowerCase().includes('bowl')) &&
        ingredients.length >= 2) {
      actions.push({
        action: 'Mixing ingredients',
        confidence: baseConfidence - 10,
        relatedIngredients: ingredients.slice(0, 3),
        relatedTools: tools.filter(t => t.name.toLowerCase().includes('bowl'))
      });
    }

    // ショート動画特有の追加推論
    if (isShortVideo) {
      // 卵 + フライパン = スクランブルエッグ
      if (ingredients.some(i => i.name.toLowerCase().includes('egg')) &&
          tools.some(t => t.name.toLowerCase().includes('pan'))) {
        actions.push({
          action: 'Making scrambled eggs',
          confidence: 75,
          relatedIngredients: ingredients.filter(i => i.name.toLowerCase().includes('egg')),
          relatedTools: tools.filter(t => t.name.toLowerCase().includes('pan'))
        });
      }

      // 複数の野菜 = サラダ作り
      const vegetables = ingredients.filter(i => i.category === 'vegetable');
      if (vegetables.length >= 2) {
        actions.push({
          action: 'Making salad',
          confidence: 65,
          relatedIngredients: vegetables,
          relatedTools: []
        });
      }

      // 火が見える = 加熱調理
      if (ingredients.length > 0 && tools.length > 0) {
        actions.push({
          action: 'Cooking with heat',
          confidence: 60,
          relatedIngredients: ingredients.slice(0, 2),
          relatedTools: tools.slice(0, 1)
        });
      }
    }

    return actions;
  }

  /**
   * 食材をカテゴリ分類
   */
  private categorizeIngredient(name: string): string {
    const categories = {
      vegetable: ['tomato', 'onion', 'garlic', 'carrot', 'potato', 'lettuce', 'cucumber'],
      meat: ['chicken', 'beef', 'pork', 'lamb', 'turkey'],
      seafood: ['fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster'],
      dairy: ['milk', 'cheese', 'butter', 'yogurt', 'cream'],
      grain: ['rice', 'pasta', 'bread', 'wheat', 'oat'],
      fruit: ['apple', 'banana', 'orange', 'lemon', 'strawberry'],
      spice: ['salt', 'pepper', 'paprika', 'cumin', 'oregano']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => name.includes(keyword))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * 調理器具をタイプ分類
   */
  private categorizeTool(name: string): string {
    const types = {
      cutting: ['knife', 'peeler', 'grater'],
      cooking: ['pan', 'pot', 'oven', 'stove'],
      mixing: ['bowl', 'whisk', 'spoon', 'spatula'],
      measuring: ['cup', 'spoon', 'scale'],
      serving: ['plate', 'fork', 'ladle']
    };

    for (const [type, keywords] of Object.entries(types)) {
      if (keywords.some(keyword => name.includes(keyword))) {
        return type;
      }
    }

    return 'other';
  }

  /**
   * アクションに関連する食材を見つける
   */
  private findRelatedIngredients(action: string, ingredients: Ingredient[]): string[] {
    // アクションと食材の関連性を判定するロジック
    return ingredients.slice(0, 3).map(i => i.name);
  }

  /**
   * アクションに関連する道具を見つける
   */
  private findRelatedTools(action: string, tools: Tool[]): string[] {
    const actionToolMap: { [key: string]: string[] } = {
      'cut': ['knife', 'cutting board'],
      'fry': ['pan', 'spatula'],
      'boil': ['pot', 'ladle'],
      'mix': ['bowl', 'whisk', 'spoon'],
      'bake': ['oven', 'baking sheet']
    };

    for (const [key, relatedTools] of Object.entries(actionToolMap)) {
      if (action.toLowerCase().includes(key)) {
        return tools
          .filter(t => relatedTools.some(rt => t.name.toLowerCase().includes(rt)))
          .map(t => t.name);
      }
    }

    return [];
  }

  /**
   * BoundingBoxの変換
   */
  private convertBoundingBox(box: any): BoundingBox | undefined {
    if (!box) return undefined;
    
    return {
      left: box.Left || 0,
      top: box.Top || 0,
      width: box.Width || 0,
      height: box.Height || 0
    };
  }

  /**
   * 信頼度スコアを計算
   */
  private calculateConfidenceScores(
    ingredients: Ingredient[],
    tools: Tool[],
    actions: CookingAction[]
  ): ConfidenceScores {
    const avgConfidence = (items: any[]) => {
      if (items.length === 0) return 0;
      return items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
    };

    const ingredientScore = avgConfidence(ingredients);
    const toolScore = avgConfidence(tools);
    const actionScore = avgConfidence(actions);

    return {
      overall: (ingredientScore + toolScore + actionScore) / 3,
      ingredients: ingredientScore,
      tools: toolScore,
      actions: actionScore
    };
  }

  /**
   * AIを使って詳細な分析を実行
   */
  async analyzeWithAI(
    frameResults: FrameAnalysisResult[],
    transcription?: string
  ): Promise<any> {
    const prompt = this.buildAnalysisPrompt(frameResults, transcription);
    
    const params = {
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    };

    try {
      const command = new InvokeModelCommand(params);
      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return JSON.parse(responseBody.content[0].text);
    } catch (error) {
      console.error('Error analyzing with AI:', error);
      throw error;
    }
  }

  /**
   * AI分析用のプロンプトを構築
   */
  private buildAnalysisPrompt(frameResults: FrameAnalysisResult[], transcription?: string): string {
    const framesSummary = frameResults.map(f => ({
      timestamp: f.timestamp,
      ingredients: f.detectedIngredients.slice(0, 5).map(i => i.name),
      tools: f.detectedTools.slice(0, 3).map(t => t.name),
      actions: f.detectedActions.slice(0, 2).map(a => a.action)
    }));

    return `
    料理動画の分析結果から、構造化されたレシピを生成してください。

    フレーム分析結果:
    ${JSON.stringify(framesSummary, null, 2)}

    ${transcription ? `音声文字起こし:\n${transcription}\n` : ''}

    以下のJSON形式で、レシピを生成してください:
    {
      "title": "料理名",
      "servings": "人数",
      "prepTime": "準備時間（分）",
      "cookTime": "調理時間（分）",
      "ingredients": [
        {
          "name": "材料名",
          "amount": "分量",
          "unit": "単位",
          "notes": "備考（オプション）"
        }
      ],
      "steps": [
        {
          "stepNumber": 1,
          "action": "動作",
          "description": "詳細な手順",
          "ingredients": ["使用する材料"],
          "tools": ["使用する道具"],
          "duration": "所要時間（分）",
          "tips": "コツやポイント（オプション）"
        }
      ],
      "tips": ["全体的なコツやポイント"],
      "tags": ["タグ"]
    }
    `;
  }

  /**
   * 複数フレームの時系列分析
   */
  async analyzeTimeSeriesFrames(frameResults: FrameAnalysisResult[]): Promise<TimeSeriesAnalysisResult> {
    const sortedFrames = frameResults.sort((a, b) => a.timestamp - b.timestamp);
    
    const cookingSequence = this.extractCookingSequence(sortedFrames);
    const ingredientProgression = this.trackIngredientProgression(sortedFrames);
    const toolUsagePattern = this.analyzeToolUsagePattern(sortedFrames);
    
    return {
      timeline: sortedFrames,
      cookingSequence,
      ingredientProgression,
      toolUsagePattern
    };
  }

  /**
   * 調理シーケンスの抽出
   */
  private extractCookingSequence(frames: FrameAnalysisResult[]): CookingStep[] {
    const steps: CookingStep[] = [];
    let currentStep: CookingStep | null = null;
    let stepNumber = 1;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const primaryAction = this.getPrimaryAction(frame);
      
      if (!primaryAction) continue;

      if (!currentStep || this.isNewCookingStep(currentStep, frame, primaryAction)) {
        if (currentStep) {
          currentStep.duration = frame.timestamp - currentStep.timestamp;
          steps.push(currentStep);
        }

        currentStep = {
          stepNumber: stepNumber++,
          timestamp: frame.timestamp,
          duration: 0,
          primaryAction: primaryAction.action,
          ingredients: this.getUniqueIngredients(frame),
          tools: this.getUniqueTools(frame),
          confidence: primaryAction.confidence,
          description: this.generateStepDescription(primaryAction, frame)
        };
      } else {
        currentStep.confidence = Math.max(currentStep.confidence, primaryAction.confidence);
        currentStep.ingredients = [...new Set([...currentStep.ingredients, ...this.getUniqueIngredients(frame)])];
        currentStep.tools = [...new Set([...currentStep.tools, ...this.getUniqueTools(frame)])];
      }
    }

    if (currentStep) {
      const lastFrame = frames[frames.length - 1];
      currentStep.duration = lastFrame.timestamp - currentStep.timestamp + 1;
      steps.push(currentStep);
    }

    return steps;
  }

  private trackIngredientProgression(frames: FrameAnalysisResult[]): IngredientProgression[] {
    const ingredientMap = new Map<string, IngredientProgression>();

    for (const frame of frames) {
      for (const ingredient of frame.detectedIngredients) {
        const name = ingredient.name.toLowerCase();
        
        if (!ingredientMap.has(name)) {
          ingredientMap.set(name, {
            ingredient: ingredient.name,
            appearances: []
          });
        }

        const progression = ingredientMap.get(name)!;
        const state = this.inferIngredientState(frame, ingredient);
        
        progression.appearances.push({
          timestamp: frame.timestamp,
          confidence: ingredient.confidence,
          state
        });
      }
    }

    return Array.from(ingredientMap.values());
  }

  private analyzeToolUsagePattern(frames: FrameAnalysisResult[]): ToolUsagePattern[] {
    const toolMap = new Map<string, ToolUsagePattern>();

    for (const frame of frames) {
      for (const tool of frame.detectedTools) {
        const name = tool.name.toLowerCase();
        
        if (!toolMap.has(name)) {
          toolMap.set(name, {
            tool: tool.name,
            usageSegments: []
          });
        }

        const pattern = toolMap.get(name)!;
        const relatedActions = frame.detectedActions.map(a => a.action);
        
        const lastSegment = pattern.usageSegments[pattern.usageSegments.length - 1];
        
        if (!lastSegment || frame.timestamp - lastSegment.endTime > 5) {
          pattern.usageSegments.push({
            startTime: frame.timestamp,
            endTime: frame.timestamp,
            confidence: tool.confidence,
            relatedActions
          });
        } else {
          lastSegment.endTime = frame.timestamp;
          lastSegment.confidence = Math.max(lastSegment.confidence, tool.confidence);
          lastSegment.relatedActions = [...new Set([...lastSegment.relatedActions, ...relatedActions])];
        }
      }
    }

    return Array.from(toolMap.values());
  }

  private getPrimaryAction(frame: FrameAnalysisResult): CookingAction | null {
    if (frame.detectedActions.length === 0) return null;
    return frame.detectedActions.reduce((max, action) => 
      action.confidence > max.confidence ? action : max
    );
  }

  private isNewCookingStep(currentStep: CookingStep, frame: FrameAnalysisResult, primaryAction: CookingAction): boolean {
    if (currentStep.primaryAction !== primaryAction.action) return true;
    if (frame.timestamp - currentStep.timestamp > 10) return true;
    
    const currentTools = new Set(currentStep.tools);
    const frameTools = new Set(this.getUniqueTools(frame));
    const commonTools = [...currentTools].filter(t => frameTools.has(t));
    
    if (commonTools.length === 0 && frameTools.size > 0) return true;
    
    return false;
  }

  private getUniqueIngredients(frame: FrameAnalysisResult): string[] {
    return [...new Set(frame.detectedIngredients.map(i => i.name))];
  }

  private getUniqueTools(frame: FrameAnalysisResult): string[] {
    return [...new Set(frame.detectedTools.map(t => t.name))];
  }

  private inferIngredientState(frame: FrameAnalysisResult, ingredient: Ingredient): 'raw' | 'processed' | 'cooked' | 'final' {
    const actions = frame.detectedActions.map(a => a.action.toLowerCase());
    
    if (actions.some(a => ['frying', 'boiling', 'baking', 'grilling', 'steaming'].includes(a))) {
      return 'cooked';
    }
    
    if (actions.some(a => ['cutting', 'chopping', 'slicing', 'mixing'].includes(a))) {
      return 'processed';
    }
    
    if (actions.some(a => ['plating', 'serving', 'garnishing'].includes(a))) {
      return 'final';
    }
    
    return 'raw';
  }

  private generateStepDescription(action: CookingAction, frame: FrameAnalysisResult): string {
    const ingredients = frame.detectedIngredients.slice(0, 2).map(i => i.name).join('と');
    const tools = frame.detectedTools.slice(0, 1).map(t => t.name).join('');
    
    let description = action.action;
    
    if (ingredients) {
      description += `：${ingredients}`;
    }
    
    if (tools) {
      description += `を${tools}で`;
    }
    
    return description;
  }
}