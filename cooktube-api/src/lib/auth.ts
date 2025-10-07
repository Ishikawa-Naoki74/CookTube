import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { JWTService } from './jwt';

const prisma = new PrismaClient();

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    isGuest: boolean;
  };
  message?: string;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  static async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validatePassword(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return { 
        valid: false, 
        message: 'Password must contain at least one lowercase letter, one uppercase letter, and one number' 
      };
    }
    return { valid: true };
  }

  static async register(data: RegisterData): Promise<AuthResponse> {
    try {
      // Validate email
      if (!this.validateEmail(data.email)) {
        return { success: false, message: 'Invalid email format' };
      }

      // Validate password
      const passwordValidation = this.validatePassword(data.password);
      if (!passwordValidation.valid) {
        return { success: false, message: passwordValidation.message };
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email }
      });

      if (existingUser) {
        return { success: false, message: 'User already exists with this email' };
      }

      // Hash password
      const hashedPassword = await this.hashPassword(data.password);

      // Create user
      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          isGuest: false,
        },
      });

      // Generate token
      const token = JWTService.generateToken(user);

      return {
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isGuest: user.isGuest,
        },
      };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Registration failed' };
    }
  }

  static async login(data: LoginData): Promise<AuthResponse> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: data.email }
      });

      if (!user || !user.password) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Compare password
      const isPasswordValid = await this.comparePassword(data.password, user.password);
      if (!isPasswordValid) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Generate token
      const token = JWTService.generateToken(user);

      return {
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isGuest: user.isGuest,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Login failed' };
    }
  }

  static async createGuestUser(): Promise<AuthResponse> {
    try {
      const guestId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const guestEmail = `${guestId}@guest.local`;

      const user = await prisma.user.create({
        data: {
          id: guestId,
          name: 'Guest User',
          email: guestEmail,
          isGuest: true,
        },
      });

      const token = JWTService.generateToken(user);

      return {
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isGuest: user.isGuest,
        },
      };
    } catch (error) {
      console.error('Guest user creation error:', error);
      return { success: false, message: 'Failed to create guest user' };
    }
  }
}