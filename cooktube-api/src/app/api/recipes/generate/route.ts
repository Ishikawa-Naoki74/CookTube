import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { RecipeProcessorService } from '@/lib/recipe-processor';

const recipeProcessor = new RecipeProcessorService();

async function handler(req: AuthenticatedRequest) {
  console.log('🚀 Recipe generation API called');
  try {
    if (req.method !== 'POST') {
      return NextResponse.json(
        { error: 'Method not allowed' },
        { status: 405 }
      );
    }

    const user = req.user;
    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { youtubeUrl } = body;
    
    console.log('📝 Request body:', { youtubeUrl });

    if (!youtubeUrl) {
      console.log('❌ YouTube URL missing');
      return NextResponse.json(
        { error: 'YouTube URL is required' },
        { status: 400 }
      );
    }

    // Start processing
    const jobId = await recipeProcessor.startProcessing(user.userId, youtubeUrl);

    return NextResponse.json({
      message: 'Recipe generation started',
      jobId,
    });

  } catch (error: any) {
    console.error('Recipe generation API error:', error);
    
    if (error.message === 'Invalid YouTube URL') {
      return NextResponse.json(
        { error: 'Please provide a valid YouTube URL' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to start recipe generation' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);