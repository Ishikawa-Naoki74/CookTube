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
      // Get single shopping list
      const shoppingList = await prisma.shoppingList.findFirst({
        where: {
          id,
          userId: user.userId,
        },
      });

      if (!shoppingList) {
        return NextResponse.json(
          { error: 'Shopping list not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(shoppingList);
    }

    if (req.method === 'PUT') {
      // Update shopping list
      const body = await req.json();
      const { name, items } = body;

      const shoppingList = await prisma.shoppingList.findFirst({
        where: {
          id,
          userId: user.userId,
        },
      });

      if (!shoppingList) {
        return NextResponse.json(
          { error: 'Shopping list not found' },
          { status: 404 }
        );
      }

      const updatedShoppingList = await prisma.shoppingList.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(items && { items: items as any }),
        },
      });

      return NextResponse.json({
        message: 'Shopping list updated successfully',
        shoppingList: updatedShoppingList,
      });
    }

    if (req.method === 'DELETE') {
      // Delete shopping list
      const shoppingList = await prisma.shoppingList.findFirst({
        where: {
          id,
          userId: user.userId,
        },
      });

      if (!shoppingList) {
        return NextResponse.json(
          { error: 'Shopping list not found' },
          { status: 404 }
        );
      }

      await prisma.shoppingList.delete({
        where: { id },
      });

      return NextResponse.json({
        message: 'Shopping list deleted successfully',
      });
    }

    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );

  } catch (error) {
    console.error('Shopping list API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);
export const PUT = withAuth(handler);
export const DELETE = withAuth(handler);