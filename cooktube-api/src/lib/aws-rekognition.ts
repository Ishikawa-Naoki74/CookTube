import { RekognitionClient, DetectLabelsCommand, DetectTextCommand } from '@aws-sdk/client-rekognition';
import { promises as fs } from 'fs';

export interface DetectedLabel {
  name: string;
  confidence: number;
  category: string;
}

export interface DetectedText {
  text: string;
  confidence: number;
  boundingBox: {
    width: number;
    height: number;
    left: number;
    top: number;
  };
}

export interface RecognitionResult {
  labels: DetectedLabel[];
  texts: DetectedText[];
  foodItems: DetectedLabel[];
  cookingTools: DetectedLabel[];
}

export class AWSRekognitionService {
  private rekognitionClient: RekognitionClient;

  // Common food-related categories for filtering (expanded)
  private readonly FOOD_CATEGORIES = [
    'Food',
    'Produce',
    'Fruit',
    'Vegetable',
    'Meat',
    'Seafood',
    'Dairy',
    'Beverage',
    'Bread',
    'Dessert',
    'Grain',
    'Herb',
    'Spice',
    'Condiment',
  ];

  // Japanese food-specific terms
  private readonly JAPANESE_FOOD_TERMS = [
    'rice', 'miso', 'tofu', 'soy sauce', 'nori', 'wasabi', 'ginger',
    'onion', 'garlic', 'carrot', 'potato', 'cabbage', 'mushroom',
    'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna',
    'egg', 'cheese', 'milk', 'butter', 'oil', 'vinegar', 'sugar', 'salt',
    'tomato', 'cucumber', 'lettuce', 'spinach', 'broccoli',
  ];

  private readonly COOKING_TOOL_NAMES = [
    'Knife',
    'Pan',
    'Pot',
    'Spoon',
    'Fork',
    'Plate',
    'Bowl',
    'Cutting Board',
    'Chopping Board',
    'Whisk',
    'Spatula',
    'Ladle',
    'Tongs',
    'Mixer',
    'Oven',
    'Stove',
    'Refrigerator',
    'Blender',
    'Microwave',
    'Grill',
    'Wok',
    'Skillet',
    'Saucepan',
    'Colander',
    'Strainer',
    'Grater',
    'Peeler',
    'Can Opener',
    'Measuring Cup',
    'Scale',
  ];

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    
    this.rekognitionClient = new RekognitionClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  private isFoodItem(label: DetectedLabel): boolean {
    const labelLower = label.name.toLowerCase();
    const categoryLower = label.category.toLowerCase();
    
    // Check food categories
    if (this.FOOD_CATEGORIES.some(category => 
      categoryLower.includes(category.toLowerCase())
    )) {
      return true;
    }
    
    // Check Japanese food terms
    if (this.JAPANESE_FOOD_TERMS.some(term => 
      labelLower.includes(term.toLowerCase())
    )) {
      return true;
    }
    
    // General food keywords
    const foodKeywords = ['food', 'ingredient', 'cooking', 'eating'];
    return foodKeywords.some(keyword => labelLower.includes(keyword));
  }

  private isCookingTool(label: DetectedLabel): boolean {
    return this.COOKING_TOOL_NAMES.some(tool => 
      label.name.toLowerCase().includes(tool.toLowerCase())
    );
  }

  async detectLabels(imagePath: string): Promise<DetectedLabel[]> {
    try {
      const imageBuffer = await fs.readFile(imagePath);

      const command = new DetectLabelsCommand({
        Image: {
          Bytes: imageBuffer,
        },
        MaxLabels: 50,
        MinConfidence: 60,
      });

      const response = await this.rekognitionClient.send(command);

      if (!response.Labels) {
        return [];
      }

      return response.Labels.map(label => ({
        name: label.Name || 'Unknown',
        confidence: label.Confidence || 0,
        category: label.Categories?.[0]?.Name || 'General',
      }));
    } catch (error) {
      console.error('Error detecting labels:', error);
      throw new Error('Failed to detect labels in image');
    }
  }

  async detectText(imagePath: string): Promise<DetectedText[]> {
    try {
      const imageBuffer = await fs.readFile(imagePath);

      const command = new DetectTextCommand({
        Image: {
          Bytes: imageBuffer,
        },
      });

      const response = await this.rekognitionClient.send(command);

      if (!response.TextDetections) {
        return [];
      }

      return response.TextDetections
        .filter(detection => detection.Type === 'WORD' && detection.Confidence && detection.Confidence > 80)
        .map(detection => ({
          text: detection.DetectedText || '',
          confidence: detection.Confidence || 0,
          boundingBox: {
            width: detection.Geometry?.BoundingBox?.Width || 0,
            height: detection.Geometry?.BoundingBox?.Height || 0,
            left: detection.Geometry?.BoundingBox?.Left || 0,
            top: detection.Geometry?.BoundingBox?.Top || 0,
          },
        }));
    } catch (error) {
      console.error('Error detecting text:', error);
      throw new Error('Failed to detect text in image');
    }
  }

  async analyzeImage(imagePath: string): Promise<RecognitionResult> {
    try {
      const [labels, texts] = await Promise.all([
        this.detectLabels(imagePath),
        this.detectText(imagePath),
      ]);

      const foodItems = labels.filter(label => this.isFoodItem(label));
      const cookingTools = labels.filter(label => this.isCookingTool(label));

      return {
        labels,
        texts,
        foodItems,
        cookingTools,
      };
    } catch (error) {
      console.error('Error analyzing image:', error);
      throw new Error('Failed to analyze image');
    }
  }

  // Helper method to get relevant cooking information
  getCookingInsights(result: RecognitionResult): {
    ingredients: string[];
    tools: string[];
    possibleDishes: string[];
  } {
    const ingredients = result.foodItems
      .filter(item => item.confidence > 75)
      .map(item => item.name);

    const tools = result.cookingTools
      .filter(tool => tool.confidence > 75)
      .map(tool => tool.name);

    // Simple dish detection based on ingredients
    const possibleDishes: string[] = [];
    const ingredientNames = ingredients.map(i => i.toLowerCase());

    if (ingredientNames.some(i => i.includes('tomato')) && 
        ingredientNames.some(i => i.includes('pasta'))) {
      possibleDishes.push('Pasta with Tomato');
    }

    if (ingredientNames.some(i => i.includes('egg')) && 
        ingredientNames.some(i => i.includes('bread'))) {
      possibleDishes.push('French Toast or Sandwich');
    }

    if (ingredientNames.some(i => i.includes('chicken'))) {
      possibleDishes.push('Chicken Dish');
    }

    return {
      ingredients: [...new Set(ingredients)], // Remove duplicates
      tools: [...new Set(tools)],
      possibleDishes,
    };
  }
}