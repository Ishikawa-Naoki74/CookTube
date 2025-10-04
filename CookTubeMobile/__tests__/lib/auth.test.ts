import { AuthService } from '../../lib/auth';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store');
const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveToken', () => {
    it('should save token to secure store', async () => {
      const token = 'test-token';
      mockSecureStore.setItemAsync.mockResolvedValue();

      await AuthService.saveToken(token);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('auth_token', token);
    });
  });

  describe('getToken', () => {
    it('should retrieve token from secure store', async () => {
      const token = 'test-token';
      mockSecureStore.getItemAsync.mockResolvedValue(token);

      const result = await AuthService.getToken();

      expect(result).toBe(token);
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('auth_token');
    });

    it('should return null if no token exists', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await AuthService.getToken();

      expect(result).toBeNull();
    });
  });

  describe('removeToken', () => {
    it('should remove token from secure store', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValue();

      await AuthService.removeToken();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('auth_token');
    });
  });

  describe('saveUser', () => {
    it('should save user data to secure store', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        isGuest: false,
      };
      mockSecureStore.setItemAsync.mockResolvedValue();

      await AuthService.saveUser(user);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('user_data', JSON.stringify(user));
    });
  });

  describe('getUser', () => {
    it('should retrieve and parse user data from secure store', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        isGuest: false,
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(user));

      const result = await AuthService.getUser();

      expect(result).toEqual(user);
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('user_data');
    });

    it('should return null if no user data exists', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await AuthService.getUser();

      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('should remove both token and user data', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValue();

      await AuthService.logout();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('auth_token');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('user_data');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true if token exists', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('test-token');

      const result = await AuthService.isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false if no token exists', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await AuthService.isAuthenticated();

      expect(result).toBe(false);
    });
  });
});