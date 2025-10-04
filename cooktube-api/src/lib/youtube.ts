export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  description: string;
  uploadDate: string;
  uploader: string;
}

export class YouTubeService {
  private static readonly API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
  private static readonly API_KEY = process.env.YOUTUBE_API_KEY;

  static validateYouTubeUrl(url: string): boolean {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/;
    return youtubeRegex.test(url);
  }

  static extractVideoId(url: string): string | null {
    const regexes = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
    ];

    for (const regex of regexes) {
      const match = url.match(regex);
      if (match) return match[1];
    }

    return null;
  }

  static async getVideoInfo(url: string): Promise<VideoInfo> {
    console.log('[YouTube] Starting getVideoInfo for URL:', url);
    
    if (!this.validateYouTubeUrl(url)) {
      console.error('[YouTube] Invalid YouTube URL:', url);
      throw new Error('Invalid YouTube URL');
    }
    console.log('[YouTube] URL validation passed');

    if (!this.API_KEY) {
      console.error('[YouTube] API key not configured');
      throw new Error('YouTube API key not configured');
    }
    console.log('[YouTube] API key found');

    const videoId = this.extractVideoId(url);
    if (!videoId) {
      console.error('[YouTube] Could not extract video ID from URL:', url);
      throw new Error('Could not extract video ID from URL');
    }
    console.log('[YouTube] Extracted video ID:', videoId);

    try {
      const apiUrl = `${this.API_BASE_URL}/videos?id=${videoId}&key=${this.API_KEY}&part=snippet,contentDetails,statistics`;
      console.log('[YouTube] Calling API:', apiUrl.replace(this.API_KEY!, 'REDACTED'));
      
      const response = await fetch(apiUrl);
      console.log('[YouTube] API response status:', response.status, response.statusText);

      if (!response.ok) {
        console.error('[YouTube] API error response:', response.status, response.statusText);
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[YouTube] API response data:', JSON.stringify(data, null, 2));

      if (!data.items || data.items.length === 0) {
        console.error('[YouTube] No video items found in response');
        throw new Error('Video not found or not accessible');
      }
      console.log('[YouTube] Found video items:', data.items.length);

      const video = data.items[0];
      const snippet = video.snippet;
      const contentDetails = video.contentDetails;
      console.log('[YouTube] Processing video snippet and content details');

      // Parse ISO 8601 duration (PT4M13S -> seconds)
      console.log('[YouTube] Parsing duration:', contentDetails.duration);
      const duration = this.parseDuration(contentDetails.duration);
      console.log('[YouTube] Parsed duration (seconds):', duration);

      // Format upload date
      console.log('[YouTube] Formatting upload date:', snippet.publishedAt);
      const uploadDate = new Date(snippet.publishedAt).toISOString().split('T')[0].replace(/-/g, '');
      console.log('[YouTube] Formatted upload date:', uploadDate);

      const result = {
        id: videoId,
        title: snippet.title || 'Unknown Title',
        thumbnail: snippet.thumbnails?.maxres?.url || 
                  snippet.thumbnails?.high?.url || 
                  snippet.thumbnails?.medium?.url || 
                  snippet.thumbnails?.default?.url || '',
        duration,
        description: snippet.description || '',
        uploadDate,
        uploader: snippet.channelTitle || 'Unknown',
      };
      
      console.log('[YouTube] Successfully created VideoInfo object:', result);
      return result;
    } catch (error) {
      console.error('[YouTube] Error in getVideoInfo:', error);
      console.error('[YouTube] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      throw new Error('Failed to get video information');
    }
  }

  private static parseDuration(duration: string): number {
    // Parse ISO 8601 duration format (PT4M13S)
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

}