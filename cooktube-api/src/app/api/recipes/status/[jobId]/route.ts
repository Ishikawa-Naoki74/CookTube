import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { RecipeProcessorService } from '@/lib/recipe-processor';

const recipeProcessor = new RecipeProcessorService();

async function handler(req: AuthenticatedRequest, context: { params: { jobId: string } }) {
  try {
    const user = req.user;
    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const { jobId } = context.params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const jobStatus = await recipeProcessor.getJobStatus(jobId);

    if (!jobStatus) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(jobStatus);

  } catch (error) {
    console.error('Job status API error:', error);
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);