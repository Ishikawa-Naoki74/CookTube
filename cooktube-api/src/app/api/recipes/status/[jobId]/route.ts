import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { RecipeProcessorService } from '@/lib/recipe-processor';

const recipeProcessor = new RecipeProcessorService();

async function handler(req: AuthenticatedRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = req.user;
    if (!user) {
      return Response.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const { jobId } = await context.params;

    if (!jobId) {
      return Response.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const jobStatus = await recipeProcessor.getJobStatus(jobId);

    if (!jobStatus) {
      return Response.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return Response.json(jobStatus);

  } catch (error) {
    console.error('Job status API error:', error);
    return Response.json(
      { error: 'Failed to get job status' },
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