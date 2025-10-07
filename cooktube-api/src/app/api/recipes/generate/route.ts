import { RecipeProcessorService } from '@/lib/recipe-processor';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { NextResponse } from 'next/server';

const recipeProcessor = new RecipeProcessorService();

async function handler(req: AuthenticatedRequest) {
  console.log('🚀 Recipe generation API called');
  try {
    if (req.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 }
      );
    }

    const user = req.user;
    if (!user) {
      return Response.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { youtubeUrl } = body;
    
    console.log('📝 Request body:', { youtubeUrl });

    if (!youtubeUrl) {
      console.log('❌ YouTube URL missing');
      return Response.json(
        { error: 'YouTube URL is required' },
        { status: 400 }
      );
    }

    // Start processing
    const jobId = await recipeProcessor.startProcessing(user.userId, youtubeUrl);

    return Response.json({
      message: 'Recipe generation started',
      jobId,
    });

  } catch (error: any) {
    console.error('Recipe generation API error:', error);

    if (error.message === 'Invalid YouTube URL') {
      return Response.json(
        { error: 'Please provide a valid YouTube URL' },
        { status: 400 }
      );
    }

    if (error.message === 'このレシピはすでに保存済みです') {
      return Response.json(
        { error: 'このレシピはすでに保存済みです', alreadyExists: true },
        { status: 409 }
      );
    }

    return Response.json(
      { error: 'Failed to start recipe generation' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}