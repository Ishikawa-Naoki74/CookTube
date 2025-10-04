import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Linking,
  Share,
  Modal,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { RecipeApiClient } from '../../lib/recipe-api';
import { ApiRecipe, RecipeIngredient, RecipeStep } from '../../types/api';

interface EditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (title: string, ingredients: RecipeIngredient[], steps: RecipeStep[]) => void;
  recipe: ApiRecipe;
}

function EditModal({ visible, onClose, onSave, recipe }: EditModalProps) {
  const [title, setTitle] = useState(recipe.videoTitle);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(recipe.ingredients || []);
  const [steps, setSteps] = useState<RecipeStep[]>(recipe.steps || []);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Recipe title is required');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(title, ingredients, steps);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: '', unit: '' }]);
  };

  const updateIngredient = (index: number, field: keyof RecipeIngredient, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const addStep = () => {
    const newStep: RecipeStep = {
      stepNumber: steps.length + 1,
      description: '',
    };
    setSteps([...steps, newStep]);
  };

  const updateStep = (index: number, description: string) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], description };
    setSteps(updated);
  };

  const removeStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      stepNumber: i + 1,
    }));
    setSteps(updated);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Edit Recipe</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSaving}>
            <Text style={[styles.saveButton, isSaving && { opacity: 0.5 }]}>
              {isSaving ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Recipe title"
              multiline
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              <TouchableOpacity onPress={addIngredient} style={styles.addButton}>
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {ingredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientRow}>
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  value={ingredient.name}
                  onChangeText={(text) => updateIngredient(index, 'name', text)}
                  placeholder="Ingredient name"
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginLeft: 8 }]}
                  value={ingredient.amount}
                  onChangeText={(text) => updateIngredient(index, 'amount', text)}
                  placeholder="Amount"
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginLeft: 8 }]}
                  value={ingredient.unit}
                  onChangeText={(text) => updateIngredient(index, 'unit', text)}
                  placeholder="Unit"
                />
                <TouchableOpacity
                  onPress={() => removeIngredient(index)}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Steps</Text>
              <TouchableOpacity onPress={addStep} style={styles.addButton}>
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {steps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <TextInput
                  style={[styles.input, { flex: 1, marginLeft: 12 }]}
                  value={step.description}
                  onChangeText={(text) => updateStep(index, text)}
                  placeholder="Step description"
                  multiline
                />
                <TouchableOpacity
                  onPress={() => removeStep(index)}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<ApiRecipe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);

  const isShortVideo = (url: string): boolean => {
    return url.includes('/shorts/') || url.includes('youtube.com/shorts');
  };
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (id) {
      loadRecipe();
    }
  }, [id]);

  const loadRecipe = async () => {
    try {
      setIsLoading(true);
      const recipeData = await RecipeApiClient.getRecipe(id);
      setRecipe(recipeData);
    } catch (error: any) {
      console.error('Failed to load recipe:', error);
      Alert.alert('Error', 'Failed to load recipe. Please try again.');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    setShowEditModal(true);
  };

  const handleSaveEdit = async (
    title: string,
    ingredients: RecipeIngredient[],
    steps: RecipeStep[]
  ) => {
    if (!recipe) return;

    try {
      const response = await RecipeApiClient.updateRecipe(recipe.id, {
        videoTitle: title,
        ingredients,
        steps,
      });
      setRecipe(response.recipe);
      Alert.alert('Success', 'Recipe updated successfully!');
    } catch (error: any) {
      console.error('Failed to update recipe:', error);
      Alert.alert('Error', 'Failed to update recipe. Please try again.');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to delete this recipe? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  };

  const confirmDelete = async () => {
    if (!recipe) return;

    try {
      await RecipeApiClient.deleteRecipe(recipe.id);
      Alert.alert('Success', 'Recipe deleted successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      console.error('Failed to delete recipe:', error);
      Alert.alert('Error', 'Failed to delete recipe. Please try again.');
    }
  };

  const handleCreateShoppingList = async () => {
    if (!recipe || !recipe.ingredients?.length) {
      Alert.alert('Error', 'No ingredients found to create shopping list.');
      return;
    }

    try {
      const response = await RecipeApiClient.createShoppingListFromRecipe(
        recipe.id,
        `${recipe.videoTitle} - Shopping List`
      );

      Alert.alert(
        'Shopping List Created',
        'A shopping list has been created from this recipe.',
        [
          {
            text: 'View List',
            onPress: () => router.push(`/shopping-list/${response.shoppingList.id}` as any),
          },
          { text: 'OK' },
        ]
      );
    } catch (error: any) {
      console.error('Failed to create shopping list:', error);
      Alert.alert('Error', 'Failed to create shopping list. Please try again.');
    }
  };

  const handleWatchVideo = async () => {
    if (!recipe?.youtubeUrl) return;

    try {
      const supported = await Linking.canOpenURL(recipe.youtubeUrl);
      if (supported) {
        await Linking.openURL(recipe.youtubeUrl);
      } else {
        Alert.alert('Error', 'Cannot open YouTube video');
      }
    } catch (error) {
      console.error('Failed to open video:', error);
      Alert.alert('Error', 'Failed to open video');
    }
  };

  const handleShare = async () => {
    if (!recipe) return;

    try {
      const message = `Check out this recipe: ${recipe.videoTitle}\n\nIngredients:\n${recipe.ingredients
        ?.map((ing) => `• ${ing.amount} ${ing.unit} ${ing.name}`)
        .join('\n')}\n\nWatch the video: ${recipe.youtubeUrl}`;

      await Share.share({
        message,
        title: recipe.videoTitle,
        url: recipe.youtubeUrl,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const toggleIngredientCheck = (index: number) => {
    const newChecked = new Set(checkedIngredients);
    if (newChecked.has(index)) {
      newChecked.delete(index);
    } else {
      newChecked.add(index);
    }
    setCheckedIngredients(newChecked);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading recipe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Recipe not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.actionButtons}>
            <TouchableOpacity onPress={handleEdit} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={[styles.actionButton, styles.deleteButton]}>
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          onPress={handleWatchVideo} 
          style={[
            styles.videoSection, 
            isShortVideo(recipe.youtubeUrl) && styles.shortVideoSection
          ]}
        >
          <Image
            source={{ uri: recipe.videoThumbnail }}
            style={[
              styles.videoThumbnail,
              isShortVideo(recipe.youtubeUrl) && styles.shortVideoThumbnail
            ]}
            contentFit="cover"
            placeholder={{ 
              uri: isShortVideo(recipe.youtubeUrl) 
                ? 'https://via.placeholder.com/360x640/cccccc/666666?text=Short+Video'
                : 'https://via.placeholder.com/640x360/cccccc/666666?text=Video+Thumbnail' 
            }}
          />
          <View style={styles.playButton}>
            <Text style={styles.playButtonText}>▶</Text>
          </View>
          {isShortVideo(recipe.youtubeUrl) && (
            <View style={styles.shortsBadge}>
              <Text style={styles.shortsBadgeText}>Shorts</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>{recipe.videoTitle}</Text>
          <Text style={styles.date}>
            Created {new Date(recipe.createdAt).toLocaleDateString()}
          </Text>

          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={handleCreateShoppingList}
            >
              <Text style={styles.quickActionText}>Create Shopping List</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients ({recipe.ingredients?.length || 0})</Text>
            {recipe.ingredients?.map((ingredient, index) => (
              <TouchableOpacity
                key={index}
                style={styles.ingredientItem}
                onPress={() => toggleIngredientCheck(index)}
              >
                <View style={[
                  styles.checkbox,
                  checkedIngredients.has(index) && styles.checkboxChecked
                ]}>
                  {checkedIngredients.has(index) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
                <View style={styles.ingredientContent}>
                  <Text style={[
                    styles.ingredientText,
                    checkedIngredients.has(index) && styles.ingredientTextChecked
                  ]}>
                    {ingredient.amount} {ingredient.unit} {ingredient.name}
                  </Text>
                  {ingredient.notes && (
                    <Text style={styles.ingredientNotes}>{ingredient.notes}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions ({recipe.steps?.length || 0} steps)</Text>
            {recipe.steps?.map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.stepNumber}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepText}>{step.description}</Text>
                  {step.duration && (
                    <Text style={styles.stepDuration}>Duration: {step.duration}</Text>
                  )}
                  {step.tips && (
                    <Text style={styles.stepTips}>💡 {step.tips}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {recipe && (
        <EditModal
          visible={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEdit}
          recipe={recipe}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  deleteButton: {
    backgroundColor: '#ffebee',
  },
  deleteButtonText: {
    color: '#d32f2f',
  },
  videoSection: {
    position: 'relative',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    marginHorizontal: 0,
    marginVertical: 0,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  shortVideoSection: {
    aspectRatio: 9 / 16, // Shorts videos are vertical (9:16)
    alignSelf: 'center',
    width: '60%', // Limit width for smart display
    maxWidth: 300,
  },
  shortVideoThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  shortsBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  shortsBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 60,
    height: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -30,
    marginLeft: -30,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 24,
    marginLeft: 4,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    lineHeight: 32,
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  quickActions: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  quickActionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
  },
  quickActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  ingredientContent: {
    flex: 1,
  },
  ingredientText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  ingredientTextChecked: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  ingredientNotes: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginTop: 2,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  stepDuration: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    fontWeight: '500',
  },
  stepTips: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 8,
    fontStyle: 'italic',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#666',
  },
  saveButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  titleInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 44,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  removeButton: {
    marginLeft: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});