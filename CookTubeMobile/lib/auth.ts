import StorageService from './storage';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

export interface User {
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
}

export class AuthService {
  static async saveToken(token: string): Promise<void> {
    await StorageService.setItem(TOKEN_KEY, token);
  }

  static async getToken(): Promise<string | null> {
    return await StorageService.getItem(TOKEN_KEY);
  }

  static async removeToken(): Promise<void> {
    await StorageService.deleteItem(TOKEN_KEY);
  }

  static async saveUser(user: User): Promise<void> {
    await StorageService.setItem(USER_KEY, JSON.stringify(user));
  }

  static async getUser(): Promise<User | null> {
    const userString = await StorageService.getItem(USER_KEY);
    return userString ? JSON.parse(userString) : null;
  }

  static async removeUser(): Promise<void> {
    await StorageService.deleteItem(USER_KEY);
  }

  static async logout(): Promise<void> {
    await this.removeToken();
    await this.removeUser();
  }

  static async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }
}