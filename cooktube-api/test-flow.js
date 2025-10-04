const fetch = require('node-fetch');

async function testRecipeGeneration() {
  console.log('🧪 Testing complete YouTube->AWS->Supabase flow...');
  
  const youtubeUrl = 'https://www.youtube.com/watch?v=4sVSEWmJqzY'; // 和風ツナボナーラ

  try {
    // Test recipe generation endpoint
    console.log('📤 Calling recipe generation API...');
    const response = await fetch('http://localhost:3003/api/recipes/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-jwt-token-for-testing'
      },
      body: JSON.stringify({ youtubeUrl })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Recipe generation started successfully!');
      console.log('📋 Job ID:', result.jobId);
      
      // Monitor job status
      if (result.jobId) {
        await monitorJobProgress(result.jobId);
      }
    } else {
      console.error('❌ Recipe generation failed:', result.error);
      console.error('Response status:', response.status);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function monitorJobProgress(jobId) {
  console.log('👀 Monitoring job progress...');
  
  let attempts = 0;
  const maxAttempts = 30; // 5 minutes max

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`http://localhost:3003/api/recipes/jobs/${jobId}`, {
        headers: {
          'Authorization': 'Bearer mock-jwt-token-for-testing'
        }
      });

      if (response.ok) {
        const job = await response.json();
        console.log(`📊 Progress: ${job.progressPercent}% - Status: ${job.status}`);
        
        if (job.status === 'completed') {
          console.log('🎉 Recipe generation completed successfully!');
          break;
        } else if (job.status === 'failed') {
          console.log('❌ Recipe generation failed:', job.errorMessage);
          break;
        }
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    } catch (error) {
      console.error('Error monitoring job:', error.message);
      attempts++;
    }
  }

  if (attempts >= maxAttempts) {
    console.log('⏰ Monitoring timed out after 5 minutes');
  }
}

testRecipeGeneration();