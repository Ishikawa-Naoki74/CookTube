import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { PrismaClient } from '@prisma/client';
import { ShoppingListItem } from '../../route';

const prisma = new PrismaClient();

async function handler(req: AuthenticatedRequest, { params }: { params: Promise<{ recipeId: string }> }) {
  try {
    const user = req.user;
    if (!user) {
      return Response.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    if (req.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 }
      );
    }

    const { recipeId } = await params;
    const body = await req.json();
    const { listName } = body;

    // Get the recipe
    const recipe = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        userId: user.userId,
      },
    });

    if (!recipe) {
      return Response.json(
        { error: 'Recipe not found' },
        { status: 404 }
      );
    }

    // Convert recipe ingredients to shopping list items
    const ingredients = recipe.ingredients as any[];
    const shoppingListItems: ShoppingListItem[] = ingredients.map((ingredient, index) => ({
      id: `${recipeId}-${index}`,
      name: ingredient.name || 'Unknown ingredient',
      amount: ingredient.amount || '1',
      unit: ingredient.unit || '',
      completed: false,
      recipeId: recipe.id,
      recipeName: recipe.videoTitle,
    }));

    // Create shopping list
    const shoppingListName = listName || `Shopping List for ${recipe.videoTitle}`;
    
    const shoppingList = await prisma.shoppingList.create({
      data: {
        userId: user.userId,
        name: shoppingListName,
        items: shoppingListItems as any,
      },
    });

    return Response.json({
      message: 'Shopping list created from recipe',
      shoppingList,
    });

  } catch (error) {
    console.error('Create shopping list from recipe API error:', error);
    return Response.json(
      { error: 'Failed to create shopping list from recipe' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);