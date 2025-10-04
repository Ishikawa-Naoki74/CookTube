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
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { RecipeApiClient } from '../../lib/recipe-api';
import { ShoppingList, ShoppingListItem } from '../../types/api';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, amount: string, unit: string) => void;
  editingItem?: ShoppingListItem;
}

function AddItemModal({ visible, onClose, onSave, editingItem }: AddItemModalProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setAmount(editingItem.amount);
      setUnit(editingItem.unit);
    } else {
      setName('');
      setAmount('');
      setUnit('');
    }
  }, [editingItem, visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Item name is required');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(name.trim(), amount.trim(), unit.trim());
      setName('');
      setAmount('');
      setUnit('');
      onClose();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>
            {editingItem ? 'Edit Item' : 'Add Item'}
          </Text>
          
          <TextInput
            style={styles.modalInput}
            value={name}
            onChangeText={setName}
            placeholder="Item name (e.g., 'Tomatoes')"
            autoFocus
            maxLength={100}
          />

          <View style={styles.modalRow}>
            <TextInput
              style={[styles.modalInput, { flex: 1, marginRight: 8 }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount (e.g., '2')"
              maxLength={20}
            />
            <TextInput
              style={[styles.modalInput, { flex: 1, marginLeft: 8 }]}
              value={unit}
              onChangeText={setUnit}
              placeholder="Unit (e.g., 'lbs')"
              maxLength={20}
            />
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={onClose}
              disabled={isSaving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton, isSaving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : editingItem ? 'Update' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface ShoppingListItemProps {
  item: ShoppingListItem;
  onToggle: (item: ShoppingListItem) => void;
  onEdit: (item: ShoppingListItem) => void;
  onDelete: (item: ShoppingListItem) => void;
}

function ShoppingListItemComponent({ item, onToggle, onEdit, onDelete }: ShoppingListItemProps) {
  const handleDelete = () => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(item),
        },
      ]
    );
  };

  return (
    <View style={[styles.listItem, item.completed && styles.listItemCompleted]}>
      <TouchableOpacity
        style={styles.itemContent}
        onPress={() => onToggle(item)}
        activeOpacity={0.7}
      >
        <View style={[
          styles.checkbox,
          item.completed && styles.checkboxChecked
        ]}>
          {item.completed && (
            <Text style={styles.checkmark}>✓</Text>
          )}
        </View>
        
        <View style={styles.itemDetails}>
          <Text style={[
            styles.itemName,
            item.completed && styles.itemNameCompleted
          ]}>
            {item.name}
          </Text>
          {(item.amount || item.unit) && (
            <Text style={[
              styles.itemAmount,
              item.completed && styles.itemAmountCompleted
            ]}>
              {item.amount} {item.unit}
            </Text>
          )}
          {item.recipeName && (
            <Text style={styles.itemRecipe}>
              From: {item.recipeName}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.itemActions}>
        <TouchableOpacity
          onPress={() => onEdit(item)}
          style={styles.actionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          style={[styles.actionButton, styles.deleteAction]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ShoppingListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingListItem | undefined>();

  const loadShoppingList = useCallback(async (isRefresh = false) => {
    if (!id) return;

    try {
      if (!isRefresh) {
        setIsLoading(true);
      }

      // For now, we'll get all shopping lists and find the one we need
      // In a real app, you'd have a dedicated endpoint for getting a single list
      const response = await RecipeApiClient.getShoppingLists();
      const foundList = response.shoppingLists.find(list => list.id === id);
      
      if (!foundList) {
        throw new Error('Shopping list not found');
      }

      setShoppingList(foundList);
    } catch (error: any) {
      console.error('Failed to load shopping list:', error);
      Alert.alert('Error', 'Failed to load shopping list. Please try again.');
      router.back();
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadShoppingList();
  }, [loadShoppingList]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadShoppingList(true);
  }, [loadShoppingList]);

  const updateShoppingList = async (updatedItems: ShoppingListItem[]) => {
    if (!shoppingList) return;

    try {
      const response = await RecipeApiClient.updateShoppingList(shoppingList.id, {
        items: updatedItems,
      });
      setShoppingList(response.shoppingList);
    } catch (error: any) {
      console.error('Failed to update shopping list:', error);
      Alert.alert('Error', 'Failed to update shopping list. Please try again.');
      throw error;
    }
  };

  const handleToggleItem = async (item: ShoppingListItem) => {
    if (!shoppingList) return;

    const updatedItems = shoppingList.items.map(listItem =>
      listItem.id === item.id
        ? { ...listItem, completed: !listItem.completed }
        : listItem
    );

    try {
      await updateShoppingList(updatedItems);
    } catch (error) {
      // Error already handled in updateShoppingList
    }
  };

  const handleAddItem = async (name: string, amount: string, unit: string) => {
    if (!shoppingList) return;

    const newItem: ShoppingListItem = {
      id: Date.now().toString(), // Temporary ID - the backend should generate this
      name,
      amount,
      unit,
      completed: false,
    };

    const updatedItems = [...shoppingList.items, newItem];

    try {
      await updateShoppingList(updatedItems);
    } catch (error) {
      throw error;
    }
  };

  const handleEditItem = async (name: string, amount: string, unit: string) => {
    if (!shoppingList || !editingItem) return;

    const updatedItems = shoppingList.items.map(item =>
      item.id === editingItem.id
        ? { ...item, name, amount, unit }
        : item
    );

    try {
      await updateShoppingList(updatedItems);
      setEditingItem(undefined);
    } catch (error) {
      throw error;
    }
  };

  const handleDeleteItem = async (itemToDelete: ShoppingListItem) => {
    if (!shoppingList) return;

    const updatedItems = shoppingList.items.filter(item => item.id !== itemToDelete.id);

    try {
      await updateShoppingList(updatedItems);
    } catch (error) {
      // Error already handled in updateShoppingList
    }
  };

  const handleShare = async () => {
    if (!shoppingList) return;

    try {
      const incompletedItems = shoppingList.items.filter(item => !item.completed);
      const completedItems = shoppingList.items.filter(item => item.completed);

      let message = `📝 ${shoppingList.name}\n\n`;
      
      if (incompletedItems.length > 0) {
        message += `Items to buy:\n${incompletedItems.map(item => 
          `• ${item.amount} ${item.unit} ${item.name}`.trim()
        ).join('\n')}\n\n`;
      }

      if (completedItems.length > 0) {
        message += `✅ Already got:\n${completedItems.map(item => 
          `• ${item.amount} ${item.unit} ${item.name}`.trim()
        ).join('\n')}\n\n`;
      }

      message += `Shared from CookTube`;

      await Share.share({
        message,
        title: shoppingList.name,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const handleClearCompleted = () => {
    if (!shoppingList) return;

    const completedItems = shoppingList.items.filter(item => item.completed);
    if (completedItems.length === 0) {
      Alert.alert('Info', 'No completed items to clear.');
      return;
    }

    Alert.alert(
      'Clear Completed Items',
      `Remove ${completedItems.length} completed item${completedItems.length !== 1 ? 's' : ''} from the list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            const updatedItems = shoppingList.items.filter(item => !item.completed);
            try {
              await updateShoppingList(updatedItems);
            } catch (error) {
              // Error already handled
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: ShoppingListItem }) => (
    <ShoppingListItemComponent
      item={item}
      onToggle={handleToggleItem}
      onEdit={(item) => {
        setEditingItem(item);
        setShowAddModal(true);
      }}
      onDelete={handleDeleteItem}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading shopping list...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!shoppingList) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Shopping list not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const completedItems = shoppingList.items.filter(item => item.completed).length;
  const totalItems = shoppingList.items.length;
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
          {completedItems > 0 && (
            <TouchableOpacity onPress={handleClearCompleted} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Clear Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listName}>{shoppingList.name}</Text>
        <Text style={styles.progress}>
          {completedItems} of {totalItems} items completed
        </Text>
        
        {totalItems > 0 && (
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progress}%` }]}
              />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
        )}
      </View>

      <FlatList
        data={shoppingList.items}
        renderItem={renderItem}
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
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No items in this list yet</Text>
            <TouchableOpacity
              style={styles.addFirstButton}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.addFirstButtonText}>Add First Item</Text>
            </TouchableOpacity>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddModal(true)}
      >
        <Text style={styles.addButtonText}>+ Add Item</Text>
      </TouchableOpacity>

      <AddItemModal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingItem(undefined);
        }}
        onSave={editingItem ? handleEditItem : handleAddItem}
        editingItem={editingItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
  listHeader: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  listName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  progress: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    minWidth: 35,
    textAlign: 'right',
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
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
  listItemCompleted: {
    backgroundColor: '#f8f8f8',
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    lineHeight: 20,
  },
  itemNameCompleted: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  itemAmount: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  itemAmountCompleted: {
    textDecorationLine: 'line-through',
    color: '#aaa',
  },
  itemRecipe: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 4,
    fontStyle: 'italic',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  deleteAction: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  addFirstButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  addFirstButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    margin: 16,
    alignItems: 'center',
  },
  addButtonText: {
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
    marginBottom: 12,
  },
  modalRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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