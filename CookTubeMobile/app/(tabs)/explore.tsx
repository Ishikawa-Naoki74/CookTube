import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { RecipeApiClient } from '../../lib/recipe-api';
import { ApiRecipe } from '../../types/api';
import { getSavedRecipes, deleteRecipe as deleteStoredRecipe, ClientSavedRecipe } from '@/utils/recipeStorage';
import { supabase } from '@/lib/supabase';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 cards per row with margins

// Combined type for both API recipes and Supabase saved recipes
type RecipeItem = (ApiRecipe | ClientSavedRecipe) & { source: 'api' | 'saved' };

interface RecipeCardProps {
  recipe: RecipeItem;
  onPress: (recipe: RecipeItem) => void;
  onDelete: (recipe: RecipeItem) => void;
}

function RecipeCard({ recipe, onPress, onDelete }: RecipeCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isShortVideo = (url: string): boolean => {
    return url.includes('/shorts/') || url.includes('youtube.com/shorts');
  };

  // Get the appropriate URL and date fields based on source
  const videoUrl = 'youtubeUrl' in recipe ? recipe.youtubeUrl : recipe.videoUrl;
  const createdDate = 'createdAt' in recipe ? recipe.createdAt : recipe.savedAt;

  const handleDelete = () => {
    console.log('🗑️ Delete button touched for recipe:', recipe.id);
    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${recipe.videoTitle}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => console.log('Delete cancelled')
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            console.log('Delete confirmed, calling onDelete...');
            try {
              await onDelete(recipe);
            } catch (error) {
              console.error('Error in delete confirmation:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => onPress(recipe)}
      activeOpacity={0.7}
    >
      <View style={styles.thumbnailContainer}>
        <Image
          source={{ uri: recipe.videoThumbnail }}
          style={[
            styles.recipeThumbnail,
            isShortVideo(videoUrl) && styles.shortsRecipeThumbnail
          ]}
          contentFit="cover"
          placeholder={{
            uri: isShortVideo(videoUrl)
              ? 'https://via.placeholder.com/300x400/cccccc/666666?text=Shorts'
              : 'https://via.placeholder.com/300x169?text=Loading...'
          }}
        />
        {isShortVideo(videoUrl) && (
          <View style={styles.shortsCardBadge}>
            <Text style={styles.shortsCardBadgeText}>Shorts</Text>
          </View>
        )}
        {recipe.source === 'saved' && (
          <View style={styles.savedBadge}>
            <Text style={styles.savedBadgeText}>Saved</Text>
          </View>
        )}
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.recipeTitle} numberOfLines={2}>
          {recipe.videoTitle}
        </Text>
        <Text style={styles.recipeDate}>
          {formatDate(createdDate)}
        </Text>
        <View style={styles.recipeStats}>
          <Text style={styles.statText}>
            {recipe.ingredients?.length || 0} ingredients
          </Text>
          <Text style={styles.statText}>
            {recipe.steps?.length || 0} steps
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function RecipeListScreen() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadRecipes = useCallback(async (page = 1, search = '', isRefresh = false) => {
    try {
      if (page === 1 && !isRefresh) {
        setIsLoading(true);
      }

      // Get Supabase session
      const { data: { session } } = await supabase.auth.getSession();

      // Load both API recipes and Supabase saved recipes
      const promises: [Promise<any>, Promise<ClientSavedRecipe[]>?] = [
        RecipeApiClient.getRecipes({
          page,
          limit: 10,
          search: search.trim() || undefined,
        })
      ];

      // Only load saved recipes if user is logged in
      if (session?.user?.id) {
        promises.push(getSavedRecipes(session.user.id));
      }

      const results = await Promise.all(promises);
      const apiResponse = results[0];
      const savedRecipes = results[1] || [];

      // Mark recipes with their source
      const apiRecipesWithSource: RecipeItem[] = apiResponse.recipes.map((recipe: ApiRecipe) => ({
        ...recipe,
        source: 'api' as const,
      }));

      const savedRecipesWithSource: RecipeItem[] = savedRecipes
        .filter(recipe =>
          !search || recipe.videoTitle.toLowerCase().includes(search.toLowerCase())
        )
        .map(recipe => ({
          ...recipe,
          source: 'saved' as const,
        }));

      // Combine and sort by date (most recent first)
      const allRecipes = [...savedRecipesWithSource, ...apiRecipesWithSource].sort((a, b) => {
        const dateA = 'createdAt' in a ? new Date(a.createdAt) : new Date(a.savedAt);
        const dateB = 'createdAt' in b ? new Date(b.createdAt) : new Date(b.savedAt);
        return dateB.getTime() - dateA.getTime();
      });

      if (page === 1) {
        setRecipes(allRecipes);
      } else {
        setRecipes(prev => [...prev, ...apiRecipesWithSource]);
      }

      setCurrentPage(page);
      setHasMore(page < apiResponse.pagination.pages);
    } catch (error: any) {
      console.error('Failed to load recipes:', error);
      Alert.alert('Error', 'Failed to load recipes. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    setCurrentPage(1);
    setHasMore(true);
    loadRecipes(1, text);
  }, [loadRecipes]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setCurrentPage(1);
    setHasMore(true);
    loadRecipes(1, searchQuery, true);
  }, [loadRecipes, searchQuery]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !isLoading) {
      setIsLoadingMore(true);
      loadRecipes(currentPage + 1, searchQuery);
    }
  }, [isLoadingMore, hasMore, isLoading, currentPage, searchQuery, loadRecipes]);

  const handleRecipePress = useCallback((recipe: RecipeItem) => {
    if (recipe.source === 'api') {
      router.push(`/recipe/${recipe.id}` as any);
    } else {
      // For saved recipes, show a simple view or navigate to detail
      Alert.alert(
        recipe.videoTitle,
        'This is a saved recipe. Open in a new screen?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View',
            onPress: () => {
              // TODO: Navigate to a saved recipe detail screen
              console.log('View saved recipe:', recipe);
            },
          },
        ]
      );
    }
  }, []);

  const handleRecipeDelete = useCallback(async (recipe: RecipeItem) => {
    console.log('🗑️ handleRecipeDelete called for recipe:', recipe.id, recipe.videoTitle);

    try {
      if (recipe.source === 'api') {
        console.log('📡 About to call RecipeApiClient.deleteRecipe...');
        const result = await RecipeApiClient.deleteRecipe(recipe.id);
        console.log('✅ RecipeApiClient.deleteRecipe completed, result:', result);
      } else {
        console.log('📱 Deleting saved recipe from Supabase...');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error('User not authenticated');
        }
        await deleteStoredRecipe(recipe.id, session.user.id);
        console.log('✅ Saved recipe deleted');
      }

      console.log('🔄 Updating local state to remove recipe from list...');
      setRecipes(prev => {
        const filtered = prev.filter(r => r.id !== recipe.id);
        console.log('📝 Recipe list updated. Before:', prev.length, 'After:', filtered.length);
        return filtered;
      });

      console.log('✅ Showing success alert...');
      Alert.alert('Success', 'Recipe deleted successfully!');
    } catch (error: any) {
      console.error('❌ Failed to delete recipe:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        data: error.data,
        name: error.name,
        stack: error.stack
      });

      const errorMessage = error.message || error.data?.error || 'Failed to delete recipe. Please try again.';
      console.log('🚨 Showing error alert:', errorMessage);
      Alert.alert('Error', errorMessage);
    }
  }, []);

  const renderRecipeCard = useCallback(({ item }: { item: RecipeItem }) => (
    <RecipeCard
      recipe={item}
      onPress={handleRecipePress}
      onDelete={handleRecipeDelete}
    />
  ), [handleRecipePress, handleRecipeDelete]);

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.emptyStateText}>Loading recipes...</Text>
        </View>
      );
    }

    if (searchQuery) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No recipes found</Text>
          <Text style={styles.emptyStateText}>
            No recipes match your search for "{searchQuery}"
          </Text>
          <TouchableOpacity
            style={styles.clearSearchButton}
            onPress={() => handleSearch('')}
          >
            <Text style={styles.clearSearchText}>Clear search</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateTitle}>No recipes yet</Text>
        <Text style={styles.emptyStateText}>
          Start by generating your first recipe from a YouTube video!
        </Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/(tabs)/')}
        >
          <Text style={styles.createButtonText}>Generate Recipe</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.loadingText}>Loading more...</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Recipes</Text>
        <Text style={styles.subtitle}>
          {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          value={searchQuery}
          onChangeText={handleSearch}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={recipes}
        renderItem={renderRecipeCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.row}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
    flexGrow: 1,
  },
  row: {
    justifyContent: 'space-between',
  },
  recipeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: CARD_WIDTH,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  thumbnailContainer: {
    position: 'relative',
  },
  recipeThumbnail: {
    width: '100%',
    height: CARD_WIDTH * 0.45, // Reduced size: 0.6 -> 0.45
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 18,
    textAlign: 'center',
  },
  shortsRecipeThumbnail: {
    height: CARD_WIDTH * 0.8, // Shorts videos are vertical so increase height
  },
  shortsCardBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  shortsCardBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  savedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  savedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  cardContent: {
    padding: 12,
  },
  recipeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    lineHeight: 18,
    marginBottom: 6,
  },
  recipeDate: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  recipeStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  clearSearchButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  clearSearchText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
});
