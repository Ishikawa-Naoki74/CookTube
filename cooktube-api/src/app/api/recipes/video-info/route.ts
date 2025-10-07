import { YouTubeService } from '@/lib/youtube';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { NextResponse } from 'next/server';

async function handler(req: AuthenticatedRequest) {
  console.log('🎬 Video info API called');
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

    // Get video info from YouTube
    console.log('🔍 Fetching video info from YouTube...');
    const videoInfo = await YouTubeService.getVideoInfo(youtubeUrl);
    console.log('✅ Video info retrieved:', videoInfo);

    return Response.json(videoInfo);

  } catch (error: any) {
    console.error('Video info API error:', error);
    
    if (error.message === 'Invalid YouTube URL') {
      return Response.json(
        { error: 'Please provide a valid YouTube URL' },
        { status: 400 }
      );
    }

    if (error.message === 'YouTube API key not configured') {
      return Response.json(
        { error: 'YouTube API is not configured' },
        { status: 500 }
      );
    }

    return Response.json(
      { error: 'Failed to get video information' },
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
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
