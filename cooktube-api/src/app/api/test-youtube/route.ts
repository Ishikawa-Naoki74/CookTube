import { NextRequest, NextResponse } from 'next/server';
import { YouTubeService } from '@/lib/youtube';

export async function GET(req: NextRequest) {
  console.log('🧪 Testing YouTube API endpoint called');
  
  const { searchParams } = new URL(req.url);
  const youtubeUrl = searchParams.get('url');

  if (!youtubeUrl) {
    return Response.json(
      { error: 'YouTube URL parameter is required. Example: ?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { status: 400 }
    );
  }

  try {
    console.log('🎬 Testing YouTube URL:', youtubeUrl);
    
    // Test URL validation
    const isValid = YouTubeService.validateYouTubeUrl(youtubeUrl);
    console.log('✅ URL validation:', isValid);
    
    if (!isValid) {
      return Response.json(
        { error: 'Invalid YouTube URL format' },
        { status: 400 }
      );
    }

    // Test video info retrieval
    console.log('📡 Calling YouTube Data API...');
    const videoInfo = await YouTubeService.getVideoInfo(youtubeUrl);
    
    console.log('✅ Video info retrieved successfully:', {
      id: videoInfo.id,
      title: videoInfo.title,
      uploader: videoInfo.uploader,
      duration: videoInfo.duration
    });

    return Response.json({
      success: true,
      message: 'YouTube Data API test successful',
      data: videoInfo
    });

  } catch (error: any) {
    console.error('❌ YouTube API test failed:', error);
    
    return Response.json(
      { 
        error: 'YouTube API test failed',
        message: error.message,
        details: error.toString()
      },
      { status: 500 }
    );
  }
}