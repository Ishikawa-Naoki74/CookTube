import { AuthService } from './auth';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3005/api';
console.log('🌐 API_BASE_URL configured as:', API_BASE_URL);

export class ApiClient {
  private static guestToken: string | null = null;

  private static async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Try to get existing token
    let token = await AuthService.getToken();
    console.log('🔑 AuthService.getToken() result:', token ? 'Token found' : 'No token');
    
    // If no token, use a cached guest token (don't save it to avoid loops)
    if (!token) {
      if (!this.guestToken) {
        this.guestToken = 'guest-token-' + Date.now();
        console.log('🔑 Generated new guest token:', this.guestToken);
      }
      token = this.guestToken;
      console.log('🔑 Using cached guest token:', this.guestToken);
    }

    headers.Authorization = `Bearer ${token}`;
    console.log('🔑 Authorization header set with token type:', token.startsWith('guest-token-') ? 'Guest' : 'User');
    return headers;
  }

  static async get<T>(endpoint: string): Promise<T> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('API GET error:', error);
      throw error;
    }
  }

  static async post<T>(endpoint: string, data: any): Promise<T> {
    try {
      console.log('📡 API POST request:', { 
        url: `${API_BASE_URL}${endpoint}`, 
        data 
      });
      
      const headers = await this.getHeaders();
      console.log('🔑 Request headers:', headers);
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      console.log('📨 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ API Success:', result);
      return result;
      
    } catch (error) {
      console.error('🔥 API POST error:', error);
      throw error;
    }
  }

  static async put<T>(endpoint: string, data: any): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  static async delete<T>(endpoint: string): Promise<T> {
    try {
      console.log('🗑️ API DELETE request:', { 
        url: `${API_BASE_URL}${endpoint}`
      });
      
      const headers = await this.getHeaders();
      console.log('🔑 Request headers:', headers);
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers,
      });

      console.log('📨 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Delete Error:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        const error = new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        (error as any).status = response.status;
        (error as any).data = errorData;
        throw error;
      }

      const result = await response.json();
      console.log('✅ API Delete Success:', result);
      return result;
      
    } catch (error) {
      console.error('🔥 API DELETE error:', error);
      throw error;
    }
  }
}