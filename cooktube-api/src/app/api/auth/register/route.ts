import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    const body = await request.json();
    const { name, email, password } = body;

    // Validate required fields
    if (!name || !email || !password) {
      return Response.json(
        { error: 'Name, email, and password are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await AuthService.register({ name, email, password });

    if (!result.success) {
      return Response.json(
        { error: result.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json({
      message: 'Registration successful',
      token: result.token,
      user: result.user,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Registration API error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}