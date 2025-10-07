import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function handler(req: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const user = req.user;
    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const { id } = params;

    if (req.method === 'GET') {
      // Get single recipe
      const recipe = await prisma.recipe.findFirst({
        where: {
          id,
          userId: user.userId,
        },
      });

      if (!recipe) {
        return NextResponse.json(
          { error: 'Recipe not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(recipe);
    }

    if (req.method === 'PUT') {
      // Update recipe
      const body = await req.json();
      const { ingredients, steps, videoTitle } = body;

      const recipe = await prisma.recipe.findFirst({
        where: {
          id,
          userId: user.userId,
        },
      });

      if (!recipe) {
        return NextResponse.json(
          { error: 'Recipe not found' },
          { status: 404 }
        );
      }

      const updatedRecipe = await prisma.recipe.update({
        where: { id },
        data: {
          ...(ingredients && { ingredients }),
          ...(steps && { steps }),
          ...(videoTitle && { videoTitle }),
        },
      });

      return NextResponse.json({
        message: 'Recipe updated successfully',
        recipe: updatedRecipe,
      });
    }

    if (req.method === 'DELETE') {
      // Delete recipe
      console.log('🗑️ DELETE request received for recipe:', id, 'by user:', user.userId);
      
      const recipe = await prisma.recipe.findFirst({
        where: {
          id,
          userId: user.userId,
        },
      });

      if (!recipe) {
        console.log('❌ Recipe not found:', id);
        return NextResponse.json(
          { error: 'Recipe not found' },
          { status: 404 }
        );
      }

      console.log('🔍 Found recipe to delete:', recipe.videoTitle);
      
      await prisma.recipe.delete({
        where: { id },
      });

      console.log('✅ Recipe deleted successfully:', id);
      
      return NextResponse.json({
        success: true,
        message: 'Recipe deleted successfully',
      });
    }

    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );

  } catch (error) {
    console.error('Recipe API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);
export const PUT = withAuth(handler);
export const DELETE = withAuth(handler);

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