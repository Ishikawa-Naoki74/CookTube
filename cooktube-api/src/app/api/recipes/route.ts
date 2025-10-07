import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function handler(req: AuthenticatedRequest) {
  try {
    const user = req.user;
    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    if (req.method === 'GET') {
      // Get user's recipes
      const { searchParams } = new URL(req.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '10');
      const search = searchParams.get('search') || '';

      const skip = (page - 1) * limit;

      const whereClause: any = {
        userId: user.userId,
      };

      if (search) {
        whereClause.OR = [
          { videoTitle: { contains: search, mode: 'insensitive' } },
          { transcriptionText: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [recipes, totalCount] = await Promise.all([
        prisma.recipe.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            videoTitle: true,
            videoThumbnail: true,
            youtubeUrl: true,
            ingredients: true,
            steps: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.recipe.count({ where: whereClause }),
      ]);

      return NextResponse.json({
        recipes,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
      });
    }

    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );

  } catch (error) {
    console.error('Recipes API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);

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