import { Stack } from 'expo-router';
import { AuthGuard } from '../../components/AuthGuard';

export default function AuthLayout() {
  return (
    <AuthGuard requireAuth={false}>
      <Stack>
        <Stack.Screen 
          name="login" 
          options={{ 
            headerShown: false,
            title: 'Login'
          }} 
        />
        <Stack.Screen 
          name="register" 
          options={{ 
            headerShown: false,
            title: 'Create Account'
          }} 
        />
      </Stack>
    </AuthGuard>
  );
}