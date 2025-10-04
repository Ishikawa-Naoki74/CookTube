import { YouTubeProcessor } from './src/lib/youtube-processor.js';

async function testYouTubeS3Upload() {
  console.log('🧪 Testing YouTube S3 Upload functionality...');
  
  const processor = new YouTubeProcessor();
  const testUrl = 'https://www.youtube.com/watch?v=4sVSEWmJqzY';
  const videoId = '4sVSEWmJqzY';
  
  try {
    console.log('📥 Starting video processing...');
    const result = await processor.processVideo(testUrl, videoId);
    
    console.log('✅ Processing completed!');
    console.log('📊 Results:');
    console.log(`- Video ID: ${result.id}`);
    console.log(`- Transcript available: ${result.transcript ? 'Yes' : 'No'}`);
    console.log(`- Audio file: ${result.audioPath ? 'Downloaded' : 'Failed'}`);
    console.log(`- Audio S3 URL: ${result.audioS3Url || 'Not uploaded'}`);
    console.log(`- Thumbnail frames: ${result.thumbnailFrames ? result.thumbnailFrames.length : 0}`);
    console.log(`- Frame S3 URLs: ${result.frameS3Urls ? result.frameS3Urls.length : 0}`);
    
    if (result.audioS3Url) {
      console.log('🎉 SUCCESS: Audio successfully uploaded to S3!');
      console.log(`🔗 S3 URL: ${result.audioS3Url}`);
    } else {
      console.log('❌ FAILED: Audio was not uploaded to S3');
    }
    
    // Cleanup
    await processor.cleanup(videoId);
    console.log('🧹 Cleanup completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testYouTubeS3Upload();