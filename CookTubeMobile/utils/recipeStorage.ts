import { supabase } from '../lib/supabase';

export interface ClientSavedRecipe {
  id: string;
  videoTitle: string;
  videoThumbnail: string;
  videoUrl: string;
  ingredients: Array<{
    name: string;
    amount?: string;
    unit?: string;
  }>;
  steps: Array<{
    step_number: number;
    description: string;
    timestamp?: number;
  }>;
  savedAt: string;
}

/**
 * Save a recipe to Supabase storage
 */
export async function saveRecipe(
  recipe: Omit<ClientSavedRecipe, 'id' | 'savedAt'>,
  userId: string
): Promise<ClientSavedRecipe> {
  try {
    // Save to Supabase storage (let Supabase generate UUID)
    const { data, error } = await supabase
      .from('saved_recipes')
      .insert({
        user_id: userId,
        video_title: recipe.videoTitle,
        video_thumbnail: recipe.videoThumbnail,
        video_url: recipe.videoUrl,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from Supabase');
    }

    // Convert Supabase format to ClientSavedRecipe format
    return {
      id: data.id,
      videoTitle: data.video_title,
      videoThumbnail: data.video_thumbnail,
      videoUrl: data.video_url,
      ingredients: data.ingredients || [],
      steps: data.steps || [],
      savedAt: data.saved_at,
    };
  } catch (error) {
    console.error('Error saving recipe:', error);
    throw new Error('Failed to save recipe');
  }
}

/**
 * Get all saved recipes for a user from Supabase
 */
export async function getSavedRecipes(userId: string): Promise<ClientSavedRecipe[]> {
  try {
    const { data, error } = await supabase
      .from('saved_recipes')
      .select('*')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (!data) {
      return [];
    }

    // Convert Supabase format to ClientSavedRecipe format
    return data.map((item: any) => ({
      id: item.id,
      videoTitle: item.video_title,
      videoThumbnail: item.video_thumbnail,
      videoUrl: item.video_url,
      ingredients: item.ingredients || [],
      steps: item.steps || [],
      savedAt: item.saved_at,
    }));
  } catch (error) {
    console.error('Error getting saved recipes:', error);
    return [];
  }
}

/**
 * Get a single saved recipe by ID
 */
export async function getSavedRecipe(
  recipeId: string,
  userId: string
): Promise<ClientSavedRecipe | null> {
  try {
    const { data, error } = await supabase
      .from('saved_recipes')
      .select('*')
      .eq('id', recipeId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      videoTitle: data.video_title,
      videoThumbnail: data.video_thumbnail,
      videoUrl: data.video_url,
      ingredients: data.ingredients || [],
      steps: data.steps || [],
      savedAt: data.saved_at,
    };
  } catch (error) {
    console.error('Error getting saved recipe:', error);
    return null;
  }
}

/**
 * Delete a saved recipe
 */
export async function deleteRecipe(recipeId: string, userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('saved_recipes')
      .delete()
      .eq('id', recipeId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error deleting recipe:', error);
    throw new Error('Failed to delete recipe');
  }
}

/**
 * Update a saved recipe
 */
export async function updateRecipe(
  recipeId: string,
  userId: string,
  updates: Partial<Omit<ClientSavedRecipe, 'id' | 'savedAt'>>
): Promise<ClientSavedRecipe | null> {
  try {
    const updateData: any = {};

    if (updates.videoTitle) updateData.video_title = updates.videoTitle;
    if (updates.videoThumbnail) updateData.video_thumbnail = updates.videoThumbnail;
    if (updates.videoUrl) updateData.video_url = updates.videoUrl;
    if (updates.ingredients) updateData.ingredients = updates.ingredients;
    if (updates.steps) updateData.steps = updates.steps;

    const { data, error } = await supabase
      .from('saved_recipes')
      .update(updateData)
      .eq('id', recipeId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      throw error || new Error('No data returned');
    }

    return {
      id: data.id,
      videoTitle: data.video_title,
      videoThumbnail: data.video_thumbnail,
      videoUrl: data.video_url,
      ingredients: data.ingredients || [],
      steps: data.steps || [],
      savedAt: data.saved_at,
    };
  } catch (error) {
    console.error('Error updating recipe:', error);
    throw new Error('Failed to update recipe');
  }
}

/**
 * Check if a recipe is already saved
 */
export async function isRecipeSaved(videoUrl: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('saved_recipes')
      .select('id')
      .eq('video_url', videoUrl)
      .eq('user_id', userId)
      .single();

    return !error && !!data;
  } catch (error) {
    return false;
  }
}
