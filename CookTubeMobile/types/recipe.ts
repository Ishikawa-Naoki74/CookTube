export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}

export interface Step {
  stepNumber: number;
  description: string;
  timestamp?: number;
}

export interface Recipe {
  id: string;
  userId: string;
  youtubeUrl: string;
  videoTitle: string;
  videoThumbnail: string;
  ingredients: Ingredient[];
  steps: Step[];
  transcriptionText: string;
  recognitionLabels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingJob {
  id: string;
  userId: string;
  youtubeUrl: string;
  status: 'pending' | 'transcribing' | 'recognizing' | 'generating' | 'completed' | 'failed';
  progressPercent: number;
  errorMessage?: string;
  createdAt: string;
}