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
    const result = await AuthService.createGuestUser();

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({
      message: 'Guest user created successfully',
      token: result.token,
      user: result.user,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Guest API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}