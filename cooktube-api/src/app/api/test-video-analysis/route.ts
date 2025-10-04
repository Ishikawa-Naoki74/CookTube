import { NextRequest, NextResponse } from 'next/server';
import { YouTubeService } from '@/lib/youtube';
import { YouTubeProcessor } from '@/lib/youtube-processor';

export async function GET(req: NextRequest) {
  console.log('🎬 Testing Video Analysis API endpoint called');
  
  const { searchParams } = new URL(req.url);
  const youtubeUrl = searchParams.get('url');

  if (!youtubeUrl) {
    return NextResponse.json(
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
      return NextResponse.json(
        { error: 'Invalid YouTube URL format' },
        { status: 400 }
      );
    }

    // Extract video ID
    const videoId = YouTubeService.extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Could not extract video ID from URL' },
        { status: 400 }
      );
    }

    console.log('📹 Video ID:', videoId);

    // Get basic video info
    console.log('📡 Getting video info...');
    const videoInfo = await YouTubeService.getVideoInfo(youtubeUrl);
    console.log('✅ Video info retrieved:', videoInfo.title);

    // Process video with analysis
    console.log('🔍 Starting full video processing with Rekognition Video...');
    const processor = new YouTubeProcessor();
    const result = await processor.processVideo(youtubeUrl, videoId);
    
    console.log('✅ Video processing completed');
    console.log('📊 Analysis summary:', result.analysisSummary?.summary);

    return NextResponse.json({
      success: true,
      message: 'Video analysis test completed',
      videoInfo,
      videoAnalysis: {
        summary: result.analysisSummary?.summary,
        detectedIngredients: result.analysisSummary?.detectedIngredients,
        detectedTools: result.analysisSummary?.detectedTools,
        keyActions: result.analysisSummary?.keyActions,
        confidenceScore: result.analysisSummary?.confidenceScore,
        totalLabels: result.videoAnalysis?.labels.length || 0,
        totalTimelineEvents: result.videoAnalysis?.timeline.length || 0
      }
    });

  } catch (error: any) {
    console.error('❌ Video analysis test failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Video analysis test failed',
        message: error.message,
        details: error.toString()
      },
      { status: 500 }
    );
  }
}