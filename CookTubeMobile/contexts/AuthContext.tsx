import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '../lib/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  loginAsGuest: () => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Start with guest user by default to avoid auth issues
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: false,
    isAuthenticated: false,
  });

  const login = async (email: string, password: string) => {
    // Mock implementation for now
    return { success: false, message: 'Login not implemented yet' };
  };

  const register = async (name: string, email: string, password: string) => {
    // Mock implementation for now
    return { success: false, message: 'Registration not implemented yet' };
  };

  const loginAsGuest = async () => {
    // Mock implementation for now
    const mockUser: User = {
      id: 'guest-' + Date.now(),
      email: 'guest@test.com',
      name: 'Guest User',
      isGuest: true
    };
    
    setState({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
    });
    
    return { success: true };
  };

  const logout = async () => {
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  const refreshUser = async () => {
    // Mock implementation for now
    console.log('Refresh user called');
  };

  const value: AuthContextType = {
    ...state,
    login,
    register,
    loginAsGuest,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}