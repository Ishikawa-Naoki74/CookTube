import { NextRequest, NextResponse } from 'next/server';
import { JWTService, JWTPayload } from '../lib/jwt';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

export function withAuth(handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    console.log('🔐 Auth middleware called for:', req.url);
    try {
      const authHeader = req.headers.get('authorization');
      console.log('🔑 Auth header:', authHeader ? 'Present' : 'Missing');
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Authorization token required' },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7);
      
      // 開発環境用: ゲストトークンを許可
      if (token.startsWith('guest-token-')) {
        console.log('🔧 Using guest authentication');
        const mockPayload = {
          userId: 'guest-' + token.substring(12),
          email: 'guest@test.com',
          isGuest: true
        };
        (req as AuthenticatedRequest).user = mockPayload;
        return handler(req as AuthenticatedRequest, context);
      }
      
      // TODO: Temporary mock token acceptance for testing
      if (token === 'mock-jwt-token-for-testing') {
        console.log('🔧 Using mock authentication for testing');
        const mockPayload = {
          userId: 'mock-guest-user',
          email: 'guest@test.com',
          isGuest: true
        };
        (req as AuthenticatedRequest).user = mockPayload;
        return handler(req as AuthenticatedRequest, context);
      }
      
      const payload = JWTService.verifyToken(token);

      if (!payload) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // Add user to request
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.user = payload;

      return handler(authenticatedReq, context);
    } catch (error) {
      console.error('Authentication error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}

export function withOptionalAuth(handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      const authHeader = req.headers.get('authorization');
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = JWTService.verifyToken(token);
        
        if (payload) {
          const authenticatedReq = req as AuthenticatedRequest;
          authenticatedReq.user = payload;
        }
      }

      return handler(req as AuthenticatedRequest, context);
    } catch (error) {
      console.error('Optional authentication error:', error);
      return handler(req as AuthenticatedRequest, context);
    }
  };
}