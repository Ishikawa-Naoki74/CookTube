import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

export default function SimpleTestScreen() {
  const { user, loginAsGuest, logout, isLoading } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>CookTube Test Screen</Text>
        
        <View style={styles.card}>
          <Text style={styles.label}>Authentication Status:</Text>
          <Text style={styles.value}>
            {isLoading ? 'Loading...' : user ? 'Authenticated' : 'Not authenticated'}
          </Text>
          
          {user && (
            <>
              <Text style={styles.label}>User:</Text>
              <Text style={styles.value}>{user.name}</Text>
              <Text style={styles.value}>{user.isGuest ? 'Guest User' : user.email}</Text>
            </>
          )}
        </View>

        {!user && !isLoading && (
          <TouchableOpacity 
            style={styles.button} 
            onPress={loginAsGuest}
          >
            <Text style={styles.buttonText}>Continue as Guest</Text>
          </TouchableOpacity>
        )}

        {user && (
          <TouchableOpacity 
            style={[styles.button, styles.logoutButton]} 
            onPress={logout}
          >
            <Text style={[styles.buttonText, styles.logoutText]}>Logout</Text>
          </TouchableOpacity>
        )}

        <View style={styles.info}>
          <Text style={styles.infoText}>
            This is a test screen to verify the app is working correctly.
          </Text>
          <Text style={styles.infoText}>
            API URL: {process.env.EXPO_PUBLIC_API_URL || 'Not configured'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    marginTop: 12,
  },
  value: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  logoutButton: {
    backgroundColor: '#DC3545',
  },
  logoutText: {
    color: '#fff',
  },
  info: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#1976d2',
    lineHeight: 20,
    marginBottom: 4,
  },
});