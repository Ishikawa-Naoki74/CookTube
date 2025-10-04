import { ApiRecipe, PaginationInfo, ProcessingJob, ShoppingList } from '../types/api';
import { ApiClient } from './api';

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  description: string;
  uploadDate: string;
  uploader: string;
}

export class RecipeApiClient {
  static async generateRecipe(youtubeUrl: string) {
    return await ApiClient.post<{ message: string; jobId: string }>('/recipes/generate', {
      youtubeUrl,
    });
  }

  static async getVideoInfo(youtubeUrl: string): Promise<VideoInfo> {
    return await ApiClient.post<VideoInfo>('/recipes/video-info', {
      youtubeUrl,
    });
  }

  static async getJobStatus(jobId: string): Promise<ProcessingJob> {
    return await ApiClient.get<ProcessingJob>(`/recipes/status/${jobId}`);
  }

  static async getRecipes(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    recipes: ApiRecipe[];
    pagination: PaginationInfo;
  }> {
    const searchParams = new URLSearchParams();
    
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.search) searchParams.append('search', params.search);

    const url = `/recipes${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    return await ApiClient.get<{
      recipes: ApiRecipe[];
      pagination: PaginationInfo;
    }>(url);
  }

  static async getRecipe(id: string): Promise<ApiRecipe> {
    return await ApiClient.get<ApiRecipe>(`/recipes/${id}`);
  }

  static async updateRecipe(
    id: string,
    data: Partial<Pick<ApiRecipe, 'ingredients' | 'steps' | 'videoTitle'>>
  ): Promise<{ recipe: ApiRecipe }> {
    return await ApiClient.put<{ recipe: ApiRecipe }>(`/recipes/${id}`, data);
  }

  static async deleteRecipe(id: string): Promise<void> {
    console.log('🗑️ RecipeApiClient.deleteRecipe called with id:', id);
    try {
      const result = await ApiClient.delete<void>(`/recipes/${id}`);
      console.log('✅ RecipeApiClient.deleteRecipe successful:', result);
      return result;
    } catch (error) {
      console.error('❌ RecipeApiClient.deleteRecipe failed:', error);
      throw error;
    }
  }

  static async getShoppingLists(): Promise<{ shoppingLists: ShoppingList[] }> {
    return await ApiClient.get<{ shoppingLists: ShoppingList[] }>('/shopping-lists');
  }

  static async createShoppingList(data: {
    name: string;
    items?: any[];
  }): Promise<{ shoppingList: ShoppingList }> {
    return await ApiClient.post<{ shoppingList: ShoppingList }>('/shopping-lists', data);
  }

  static async updateShoppingList(
    id: string,
    data: Partial<Pick<ShoppingList, 'name' | 'items'>>
  ): Promise<{ shoppingList: ShoppingList }> {
    return await ApiClient.put<{ shoppingList: ShoppingList }>(`/shopping-lists/${id}`, data);
  }

  static async deleteShoppingList(id: string): Promise<void> {
    await ApiClient.delete<void>(`/shopping-lists/${id}`);
  }

  static async createShoppingListFromRecipe(
    recipeId: string,
    listName?: string
  ): Promise<{ shoppingList: ShoppingList }> {
    return await ApiClient.post<{ shoppingList: ShoppingList }>(
      `/shopping-lists/from-recipe/${recipeId}`,
      { listName }
    );
  }
}