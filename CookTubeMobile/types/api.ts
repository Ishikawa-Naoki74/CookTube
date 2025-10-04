export interface ApiRecipe {
  id: string;
  videoTitle: string;
  videoThumbnail: string;
  youtubeUrl: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  name: string;
  amount: string;
  unit: string;
  notes?: string;
}

export interface RecipeStep {
  stepNumber: number;
  description: string;
  duration?: string;
  tips?: string;
}

export interface ProcessingJob {
  jobId: string;
  status: 'pending' | 'transcribing' | 'recognizing' | 'generating' | 'completed' | 'failed';
  progressPercent: number;
  errorMessage?: string;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  amount: string;
  unit: string;
  completed: boolean;
  recipeId?: string;
  recipeName?: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  items: ShoppingListItem[];
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}