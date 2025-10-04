import React from 'react';
import { render } from '@testing-library/react-native';
import { AuthGuard } from '../../components/AuthGuard';
import { useAuth } from '../../contexts/AuthContext';

jest.mock('../../contexts/AuthContext');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{`Redirecting to ${href}`}</Text>;
  },
}));

describe('AuthGuard', () => {
  const mockChildren = <div data-testid="protected-content">Protected Content</div>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show loading when isLoading is true', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      login: jest.fn(),
      register: jest.fn(),
      loginAsGuest: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    const { getByText } = render(<AuthGuard>{mockChildren}</AuthGuard>);

    expect(getByText('Loading...')).toBeTruthy();
  });

  it('should redirect to login when requireAuth is true and user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: jest.fn(),
      register: jest.fn(),
      loginAsGuest: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    const { getByTestId } = render(
      <AuthGuard requireAuth={true}>{mockChildren}</AuthGuard>
    );

    expect(getByTestId('redirect')).toBeTruthy();
  });

  it('should redirect to tabs when requireAuth is false and user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: '1', name: 'Test', email: 'test@example.com', isGuest: false },
      login: jest.fn(),
      register: jest.fn(),
      loginAsGuest: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    const { getByTestId } = render(
      <AuthGuard requireAuth={false}>{mockChildren}</AuthGuard>
    );

    expect(getByTestId('redirect')).toBeTruthy();
  });

  it('should render children when auth state matches requirements', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: '1', name: 'Test', email: 'test@example.com', isGuest: false },
      login: jest.fn(),
      register: jest.fn(),
      loginAsGuest: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    const { getByTestId } = render(
      <AuthGuard requireAuth={true}>{mockChildren}</AuthGuard>
    );

    expect(getByTestId('protected-content')).toBeTruthy();
  });
});