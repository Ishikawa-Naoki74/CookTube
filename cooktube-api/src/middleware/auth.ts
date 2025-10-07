import { NextRequest, NextResponse } from 'next/server';
import { JWTPayload, JWTService } from '../lib/jwt';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

export function withAuth<T = Record<string, unknown>>(
  handler: (req: AuthenticatedRequest, context: T) => Promise<NextResponse>
) {
  return async (req: NextRequest, context: T): Promise<NextResponse> => {
    console.log('🔐 Auth middleware called for:', req.url);

    // Skip auth for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      const authHeader = req.headers.get('authorization');
      console.log('🔑 Auth header:', authHeader ? 'Present' : 'Missing');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Authorization token required' },
          {
            status: 401,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
          }
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
        const response = await handler(req as AuthenticatedRequest, context);
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return response;
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
        const response = await handler(req as AuthenticatedRequest, context);
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return response;
      }
      
      const payload = JWTService.verifyToken(token);

      if (!payload) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          {
            status: 401,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
          }
        );
      }

      // Add user to request
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.user = payload;

      const response = await handler(authenticatedReq, context);

      // Add CORS headers to response
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      return response;
    } catch (error) {
      console.error('Authentication error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        {
          status: 401,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
      );
    }
  };
}

export function withOptionalAuth<T = Record<string, unknown>>(
  handler: (req: AuthenticatedRequest, context: T) => Promise<NextResponse>
) {
  return async (req: NextRequest, context: T): Promise<NextResponse> => {
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