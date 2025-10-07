import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ShoppingListItem {
  id: string;
  name: string;
  amount: string;
  unit: string;
  completed: boolean;
  recipeId?: string;
  recipeName?: string;
}

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
      // Get user's shopping lists
      const shoppingLists = await prisma.shoppingList.findMany({
        where: { userId: user.userId },
        orderBy: { updatedAt: 'desc' },
      });

      return NextResponse.json({ shoppingLists });
    }

    if (req.method === 'POST') {
      // Create new shopping list
      const body = await req.json();
      const { name, items } = body;

      if (!name) {
        return NextResponse.json(
          { error: 'Shopping list name is required' },
          { status: 400 }
        );
      }

      const shoppingList = await prisma.shoppingList.create({
        data: {
          userId: user.userId,
          name,
          items: (items || []) as any,
        },
      });

      return NextResponse.json({
        message: 'Shopping list created successfully',
        shoppingList,
      });
    }

    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );

  } catch (error) {
    console.error('Shopping lists API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);
export const POST = withAuth(handler);