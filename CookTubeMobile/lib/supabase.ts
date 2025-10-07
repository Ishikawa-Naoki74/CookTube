import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️  Supabase credentials not configured. Some features may not work.');
}

const isReactNative =
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isReactNative ? AsyncStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    // Web 環境では URL 検出を有効、React Native では無効
    detectSessionInUrl: !isReactNative,
  },
});
