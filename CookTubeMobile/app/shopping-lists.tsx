import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { RecipeApiClient } from '../lib/recipe-api';
import { ShoppingList, ShoppingListItem } from '../types/api';

interface CreateListModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}

function CreateListModal({ visible, onClose, onSave }: CreateListModalProps) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Shopping list name is required');
      return;
    }

    setIsCreating(true);
    try {
      await onSave(name.trim());
      setName('');
      onClose();
    } catch (error) {
      console.error('Create error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Create Shopping List</Text>
          
          <TextInput
            style={styles.modalInput}
            value={name}
            onChangeText={setName}
            placeholder="List name (e.g., 'Weekly Groceries')"
            autoFocus
            maxLength={100}
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={onClose}
              disabled={isCreating}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton, isCreating && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={isCreating}
            >
              <Text style={styles.saveButtonText}>
                {isCreating ? 'Creating...' : 'Create'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface ShoppingListCardProps {
  list: ShoppingList;
  onPress: (list: ShoppingList) => void;
  onDelete: (list: ShoppingList) => void;
}

function ShoppingListCard({ list, onPress, onDelete }: ShoppingListCardProps) {
  const completedItems = list.items?.filter(item => item.completed).length || 0;
  const totalItems = list.items?.length || 0;
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Shopping List',
      `Are you sure you want to delete "${list.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(list),
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.listCard}
      onPress={() => onPress(list)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.listName} numberOfLines={2}>
          {list.name}
        </Text>
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.deleteButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardStats}>
        <Text style={styles.itemCount}>
          {completedItems} of {totalItems} items completed
        </Text>
        <Text style={styles.cardDate}>
          {formatDate(list.updatedAt || list.createdAt)}
        </Text>
      </View>

      {totalItems > 0 && (
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>{Math.round(progress)}%</Text>
        </View>
      )}

      {list.isShared && (
        <View style={styles.sharedBadge}>
          <Text style={styles.sharedText}>Shared</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ShoppingListsScreen() {
  const { user } = useAuth();
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadShoppingLists = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) {
        setIsLoading(true);
      }

      const response = await RecipeApiClient.getShoppingLists();
      setShoppingLists(response.shoppingLists || []);
    } catch (error: any) {
      console.error('Failed to load shopping lists:', error);
      Alert.alert('Error', 'Failed to load shopping lists. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadShoppingLists();
  }, [loadShoppingLists]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadShoppingLists(true);
  }, [loadShoppingLists]);

  const handleCreateList = async (name: string) => {
    try {
      await RecipeApiClient.createShoppingList({ name });
      await loadShoppingLists(true);
    } catch (error: any) {
      console.error('Failed to create shopping list:', error);
      Alert.alert('Error', 'Failed to create shopping list. Please try again.');
      throw error;
    }
  };

  const handleDeleteList = async (list: ShoppingList) => {
    try {
      await RecipeApiClient.deleteShoppingList(list.id);
      await loadShoppingLists(true);
    } catch (error: any) {
      console.error('Failed to delete shopping list:', error);
      Alert.alert('Error', 'Failed to delete shopping list. Please try again.');
    }
  };

  const handleListPress = useCallback((list: ShoppingList) => {
    router.push(`/shopping-list/${list.id}` as any);
  }, []);

  const renderListCard = useCallback(({ item }: { item: ShoppingList }) => (
    <ShoppingListCard
      list={item}
      onPress={handleListPress}
      onDelete={handleDeleteList}
    />
  ), [handleListPress]);

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.emptyStateText}>Loading shopping lists...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateTitle}>No shopping lists yet</Text>
        <Text style={styles.emptyStateText}>
          Create your first shopping list or generate one from a recipe!
        </Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>Create Shopping List</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <Text style={styles.title}>Shopping Lists</Text>
            <Text style={styles.subtitle}>
              {shoppingLists.length} list{shoppingLists.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.addButtonText}>+ New List</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={shoppingLists}
        renderItem={renderListCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      <CreateListModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreateList}
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
    marginTop: 2,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'flex-end',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  listName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    lineHeight: 22,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemCount: {
    fontSize: 14,
    color: '#666',
  },
  cardDate: {
    fontSize: 12,
    color: '#888',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    minWidth: 35,
    textAlign: 'right',
  },
  sharedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sharedText: {
    color: '#fff',
    fontSize: 10,
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
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});