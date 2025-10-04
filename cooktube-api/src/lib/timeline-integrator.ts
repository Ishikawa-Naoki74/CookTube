import { FrameAnalysisResult, Ingredient, Tool, CookingAction } from './frame-analyzer';

export interface TimelineSegment {
  startTime: number;
  endTime: number;
  mainAction: string;
  ingredients: string[];
  tools: string[];
  description: string;
  keyFrames: number[];
}

export interface IntegratedRecipeData {
  totalDuration: number;
  allIngredients: Map<string, IngredientInfo>;
  allTools: Set<string>;
  timeline: TimelineSegment[];
  cookingPhases: CookingPhase[];
}

export interface IngredientInfo {
  name: string;
  firstAppearance: number;
  lastAppearance: number;
  frequency: number;
  estimatedAmount?: string;
}

export interface CookingPhase {
  phase: string;
  startTime: number;
  endTime: number;
  description: string;
  subPhases?: CookingPhase[];
}

export class TimelineIntegrator {
  private readonly ACTION_CONTINUITY_THRESHOLD = 5; // 秒
  private readonly MIN_SEGMENT_DURATION = 3; // 秒
  private readonly CONFIDENCE_THRESHOLD = 70;

  /**
   * フレーム分析結果を時系列で統合
   */
  integrate(frameResults: FrameAnalysisResult[]): IntegratedRecipeData {
    // フレームを時間順にソート
    const sortedFrames = [...frameResults].sort((a, b) => a.timestamp - b.timestamp);

    // 全体の材料と道具を集計
    const allIngredients = this.aggregateIngredients(sortedFrames);
    const allTools = this.aggregateTools(sortedFrames);

    // タイムラインセグメントを生成
    const timeline = this.createTimelineSegments(sortedFrames);

    // 調理フェーズを識別
    const cookingPhases = this.identifyCookingPhases(timeline, sortedFrames);

    const totalDuration = sortedFrames[sortedFrames.length - 1]?.timestamp || 0;

    return {
      totalDuration,
      allIngredients,
      allTools,
      timeline,
      cookingPhases
    };
  }

  /**
   * 材料を集計して重複を除去
   */
  private aggregateIngredients(frames: FrameAnalysisResult[]): Map<string, IngredientInfo> {
    const ingredientMap = new Map<string, IngredientInfo>();

    for (const frame of frames) {
      for (const ingredient of frame.detectedIngredients) {
        if (ingredient.confidence < this.CONFIDENCE_THRESHOLD) continue;

        const normalizedName = this.normalizeIngredientName(ingredient.name);
        
        if (ingredientMap.has(normalizedName)) {
          const info = ingredientMap.get(normalizedName)!;
          info.lastAppearance = frame.timestamp;
          info.frequency++;
        } else {
          ingredientMap.set(normalizedName, {
            name: ingredient.name,
            firstAppearance: frame.timestamp,
            lastAppearance: frame.timestamp,
            frequency: 1
          });
        }
      }
    }

    // 出現頻度から重要度を判定し、量を推定
    for (const [name, info] of ingredientMap.entries()) {
      info.estimatedAmount = this.estimateIngredientAmount(name, info.frequency);
    }

    return ingredientMap;
  }

  /**
   * 道具を集計
   */
  private aggregateTools(frames: FrameAnalysisResult[]): Set<string> {
    const toolSet = new Set<string>();

    for (const frame of frames) {
      for (const tool of frame.detectedTools) {
        if (tool.confidence >= this.CONFIDENCE_THRESHOLD) {
          toolSet.add(this.normalizeToolName(tool.name));
        }
      }
    }

    return toolSet;
  }

  /**
   * タイムラインセグメントを作成
   */
  private createTimelineSegments(frames: FrameAnalysisResult[]): TimelineSegment[] {
    const segments: TimelineSegment[] = [];
    let currentSegment: TimelineSegment | null = null;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const mainAction = this.determineMainAction(frame);

      if (!currentSegment || !this.isContinuousAction(currentSegment.mainAction, mainAction, frame.timestamp, currentSegment.endTime)) {
        // 新しいセグメントを開始
        if (currentSegment && currentSegment.endTime - currentSegment.startTime >= this.MIN_SEGMENT_DURATION) {
          segments.push(currentSegment);
        }

        currentSegment = {
          startTime: frame.timestamp,
          endTime: frame.timestamp,
          mainAction: mainAction,
          ingredients: [],
          tools: [],
          description: '',
          keyFrames: [frame.frameNumber]
        };
      } else {
        // 既存のセグメントを更新
        currentSegment.endTime = frame.timestamp;
        currentSegment.keyFrames.push(frame.frameNumber);
      }

      // 材料と道具を追加
      this.updateSegmentContents(currentSegment, frame);
    }

    // 最後のセグメントを追加
    if (currentSegment && currentSegment.endTime - currentSegment.startTime >= this.MIN_SEGMENT_DURATION) {
      segments.push(currentSegment);
    }

    // セグメントの説明を生成
    for (const segment of segments) {
      segment.description = this.generateSegmentDescription(segment);
    }

    return segments;
  }

  /**
   * 調理フェーズを識別
   */
  private identifyCookingPhases(timeline: TimelineSegment[], frames: FrameAnalysisResult[]): CookingPhase[] {
    const phases: CookingPhase[] = [];
    
    // 準備フェーズ
    const prepPhase = this.findPreparationPhase(timeline);
    if (prepPhase) phases.push(prepPhase);

    // 調理フェーズ
    const cookingPhase = this.findCookingPhase(timeline);
    if (cookingPhase) phases.push(cookingPhase);

    // 仕上げフェーズ
    const finishingPhase = this.findFinishingPhase(timeline);
    if (finishingPhase) phases.push(finishingPhase);

    return phases;
  }

  /**
   * 準備フェーズを識別
   */
  private findPreparationPhase(timeline: TimelineSegment[]): CookingPhase | null {
    const prepActions = ['cutting', 'chopping', 'slicing', 'washing', 'peeling'];
    const prepSegments = timeline.filter(s => 
      prepActions.some(action => s.mainAction.toLowerCase().includes(action))
    );

    if (prepSegments.length === 0) return null;

    return {
      phase: 'Preparation',
      startTime: prepSegments[0].startTime,
      endTime: prepSegments[prepSegments.length - 1].endTime,
      description: 'Preparing ingredients by cutting, washing, and organizing'
    };
  }

  /**
   * 調理フェーズを識別
   */
  private findCookingPhase(timeline: TimelineSegment[]): CookingPhase | null {
    const cookingActions = ['frying', 'boiling', 'steaming', 'baking', 'grilling', 'cooking'];
    const cookingSegments = timeline.filter(s => 
      cookingActions.some(action => s.mainAction.toLowerCase().includes(action))
    );

    if (cookingSegments.length === 0) return null;

    return {
      phase: 'Cooking',
      startTime: cookingSegments[0].startTime,
      endTime: cookingSegments[cookingSegments.length - 1].endTime,
      description: 'Main cooking process'
    };
  }

  /**
   * 仕上げフェーズを識別
   */
  private findFinishingPhase(timeline: TimelineSegment[]): CookingPhase | null {
    const finishingActions = ['plating', 'garnishing', 'serving', 'arranging'];
    const finishingSegments = timeline.filter(s => 
      finishingActions.some(action => s.mainAction.toLowerCase().includes(action))
    );

    if (finishingSegments.length === 0) return null;

    return {
      phase: 'Finishing',
      startTime: finishingSegments[0].startTime,
      endTime: finishingSegments[finishingSegments.length - 1].endTime,
      description: 'Final plating and presentation'
    };
  }

  /**
   * フレームのメインアクションを決定
   */
  private determineMainAction(frame: FrameAnalysisResult): string {
    if (frame.detectedActions.length === 0) {
      return 'Preparing';
    }
    
    // 最も信頼度の高いアクションを選択
    return frame.detectedActions[0].action;
  }

  /**
   * アクションが連続しているかを判定
   */
  private isContinuousAction(
    previousAction: string,
    currentAction: string,
    currentTime: number,
    previousEndTime: number
  ): boolean {
    // 時間的に離れすぎている場合は別アクション
    if (currentTime - previousEndTime > this.ACTION_CONTINUITY_THRESHOLD) {
      return false;
    }

    // 同じカテゴリのアクションかを判定
    return this.areSimilarActions(previousAction, currentAction);
  }

  /**
   * アクションが類似しているかを判定
   */
  private areSimilarActions(action1: string, action2: string): boolean {
    const actionCategories = {
      cutting: ['cut', 'chop', 'slice', 'dice', 'mince'],
      heating: ['fry', 'boil', 'steam', 'bake', 'grill', 'cook'],
      mixing: ['mix', 'stir', 'whisk', 'fold', 'blend'],
      preparation: ['wash', 'peel', 'drain', 'prepare']
    };

    for (const category of Object.values(actionCategories)) {
      const action1InCategory = category.some(a => action1.toLowerCase().includes(a));
      const action2InCategory = category.some(a => action2.toLowerCase().includes(a));
      
      if (action1InCategory && action2InCategory) {
        return true;
      }
    }

    return action1.toLowerCase() === action2.toLowerCase();
  }

  /**
   * セグメントの内容を更新
   */
  private updateSegmentContents(segment: TimelineSegment, frame: FrameAnalysisResult): void {
    // 材料を追加（重複を避ける）
    for (const ingredient of frame.detectedIngredients) {
      if (ingredient.confidence >= this.CONFIDENCE_THRESHOLD) {
        const name = this.normalizeIngredientName(ingredient.name);
        if (!segment.ingredients.includes(name)) {
          segment.ingredients.push(name);
        }
      }
    }

    // 道具を追加（重複を避ける）
    for (const tool of frame.detectedTools) {
      if (tool.confidence >= this.CONFIDENCE_THRESHOLD) {
        const name = this.normalizeToolName(tool.name);
        if (!segment.tools.includes(name)) {
          segment.tools.push(name);
        }
      }
    }
  }

  /**
   * セグメントの説明を生成
   */
  private generateSegmentDescription(segment: TimelineSegment): string {
    const duration = Math.round(segment.endTime - segment.startTime);
    const ingredientsList = segment.ingredients.slice(0, 3).join(', ');
    const toolsList = segment.tools.slice(0, 2).join(' and ');

    let description = `${segment.mainAction}`;
    
    if (ingredientsList) {
      description += ` ${ingredientsList}`;
    }
    
    if (toolsList) {
      description += ` using ${toolsList}`;
    }
    
    description += ` (${duration} seconds)`;
    
    return description;
  }

  /**
   * 材料名を正規化
   */
  private normalizeIngredientName(name: string): string {
    // 単数形/複数形の統一
    const normalized = name.toLowerCase().trim();
    
    // 一般的な複数形を単数形に変換
    const pluralMappings: { [key: string]: string } = {
      'tomatoes': 'tomato',
      'potatoes': 'potato',
      'onions': 'onion',
      'carrots': 'carrot',
      'eggs': 'egg'
    };

    return pluralMappings[normalized] || normalized;
  }

  /**
   * 道具名を正規化
   */
  private normalizeToolName(name: string): string {
    return name.toLowerCase().trim();
  }

  /**
   * 材料の量を推定
   */
  private estimateIngredientAmount(name: string, frequency: number): string {
    // 出現頻度と材料の種類から量を推定
    const commonAmounts: { [key: string]: string } = {
      'salt': 'to taste',
      'pepper': 'to taste',
      'oil': '2-3 tablespoons',
      'butter': '2 tablespoons',
      'garlic': '2-3 cloves',
      'onion': '1 medium'
    };

    const normalizedName = name.toLowerCase();
    
    if (commonAmounts[normalizedName]) {
      return commonAmounts[normalizedName];
    }

    // 頻度に基づいて推定
    if (frequency > 10) {
      return 'main ingredient';
    } else if (frequency > 5) {
      return 'moderate amount';
    } else {
      return 'small amount';
    }
  }

  /**
   * レシピステップを生成
   */
  generateRecipeSteps(integratedData: IntegratedRecipeData): any[] {
    const steps: any[] = [];
    let stepNumber = 1;

    for (const segment of integratedData.timeline) {
      // 短すぎるセグメントはスキップ
      if (segment.endTime - segment.startTime < this.MIN_SEGMENT_DURATION) {
        continue;
      }

      steps.push({
        stepNumber: stepNumber++,
        action: segment.mainAction,
        description: segment.description,
        ingredients: segment.ingredients,
        tools: segment.tools,
        duration: Math.round(segment.endTime - segment.startTime),
        videoTimestamp: segment.startTime
      });
    }

    return steps;
  }
}