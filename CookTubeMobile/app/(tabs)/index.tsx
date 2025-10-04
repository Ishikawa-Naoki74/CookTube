import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { RecipeApiClient, VideoInfo } from '../../lib/recipe-api';

export default function HomeScreen() {
  const { user } = useAuth();
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingVideoInfo, setIsLoadingVideoInfo] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  const validateYouTubeUrl = (url: string): boolean => {
    // Regular YouTube videos: youtube.com/watch?v=VIDEO_ID, youtu.be/VIDEO_ID
    // YouTube Shorts: youtube.com/shorts/VIDEO_ID
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/;
    return youtubeRegex.test(url);
  };

  const handleGetVideoInfo = async () => {
    if (!youtubeUrl.trim() || !validateYouTubeUrl(youtubeUrl)) {
      return;
    }

    try {
      setIsLoadingVideoInfo(true);
      const info = await RecipeApiClient.getVideoInfo(youtubeUrl.trim());
      setVideoInfo(info);
      console.log('✅ Video info loaded:', info);
    } catch (error: any) {
      console.error('❌ Failed to get video info:', error);
      setVideoInfo(null);
    } finally {
      setIsLoadingVideoInfo(false);
    }
  };

  const handleGenerateRecipe = async () => {
    console.log('🎬 Generate recipe button clicked');
    console.log('📝 YouTube URL:', youtubeUrl);
    
    if (!youtubeUrl.trim()) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    if (!validateYouTubeUrl(youtubeUrl)) {
      Alert.alert('Error', 'Please enter a valid YouTube URL');
      return;
    }

    try {
      console.log('🚀 Starting recipe generation...');
      setIsGenerating(true);
      const response = await RecipeApiClient.generateRecipe(youtubeUrl.trim());
      console.log('✅ Recipe generation started:', response);
      
      // Navigate to processing screen
      router.push({
        pathname: '/recipe/processing',
        params: {
          jobId: response.jobId,
          videoTitle: videoInfo?.title || '',
          videoThumbnail: videoInfo?.thumbnail || ''
        }
      });

      setYoutubeUrl('');
      setVideoInfo(null);
    } catch (error: any) {
      console.error('❌ Recipe generation failed:', error);
      
      // For duplicate errors, provide navigation option to existing recipe
      if (error.status === 409 && error.data?.existingRecipeId) {
        Alert.alert(
          'Recipe Already Exists',
          error.data.message || 'You have already saved this recipe.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'View Existing Recipe', 
              onPress: () => router.push(`/recipe/${error.data.existingRecipeId}`)
            }
          ]
        );
      } else if (error.status === 409 && error.data?.jobId) {
        // If processing in progress
        Alert.alert(
          'Processing in Progress',
          error.data.message || 'This video is already being processed.',
          [
            { text: 'OK', style: 'cancel' },
            { 
              text: 'View Progress', 
              onPress: () => router.push({
                pathname: '/recipe/processing',
                params: {
                  jobId: error.data.jobId,
                  videoTitle: videoInfo?.title || '',
                  videoThumbnail: videoInfo?.thumbnail || ''
                }
              })
            }
          ]
        );
      } else {
        Alert.alert('Error', error.message || 'Failed to generate recipe');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.welcomeText}>
              Welcome{user?.name && !user.isGuest ? `, ${user.name}` : ''}!
            </Text>
            <Text style={styles.subtitle}>
              Generate recipes from YouTube cooking videos
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Recipe from Video</Text>
            <Text style={styles.cardDescription}>
              Paste a YouTube cooking video URL below and our AI will generate a structured recipe for you.
            </Text>

            <TextInput
              style={styles.input}
              value={youtubeUrl}
              onChangeText={(text) => {
                setYoutubeUrl(text);
                setVideoInfo(null);
              }}
              onBlur={handleGetVideoInfo}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={2}
              editable={!isGenerating}
              placeholder="Paste YouTube URL here..."
            />

            {/* Video Info Display */}
            {isLoadingVideoInfo && (
              <View style={styles.videoInfoLoading}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.videoInfoLoadingText}>Loading video information...</Text>
              </View>
            )}

            {videoInfo && (
              <View style={styles.videoInfoCard}>
                <Image source={{ uri: videoInfo.thumbnail }} style={styles.thumbnail} />
                <View style={styles.videoInfoContent}>
                  <Text style={styles.videoTitle} numberOfLines={2}>
                    {videoInfo.title}
                  </Text>
                  <Text style={styles.videoUploader}>
                    by {videoInfo.uploader}
                  </Text>
                  <View style={styles.videoMeta}>
                    <Text style={styles.videoDuration}>
                      {formatDuration(videoInfo.duration)}
                    </Text>
                    <Text style={styles.videoDate}>
                      {videoInfo.uploadDate}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.generateButton, (isGenerating || !videoInfo) && styles.buttonDisabled]}
              onPress={handleGenerateRecipe}
              disabled={isGenerating || !videoInfo}
            >
              {isGenerating ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator size="small" color="#fff" style={styles.buttonLoader} />
                  <Text style={styles.buttonText}>Generating Recipe...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>
                  {videoInfo ? 'Generate Recipe' : 'Enter YouTube URL First'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>How it works:</Text>
            <View style={styles.infoStep}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>Paste a YouTube cooking video URL</Text>
            </View>
            <View style={styles.infoStep}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>AI analyzes the video's audio and visuals</Text>
            </View>
            <View style={styles.infoStep}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepText}>Get a structured recipe with ingredients and steps</Text>
            </View>
            <View style={styles.infoStep}>
              <Text style={styles.stepNumber}>4</Text>
              <Text style={styles.stepText}>Create shopping lists and save recipes</Text>
            </View>
          </View>

          {user?.isGuest && (
            <View style={styles.guestNotice}>
              <Text style={styles.guestNoticeTitle}>Guest Mode</Text>
              <Text style={styles.guestNoticeText}>
                You're using CookTube as a guest. Your recipes are saved temporarily. Create an account to keep them permanently.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    marginBottom: 30,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    marginBottom: 16,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  generateButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonLoader: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  videoInfoLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginBottom: 16,
  },
  videoInfoLoadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#666',
  },
  videoInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  thumbnail: {
    width: 120,
    height: 90,
    backgroundColor: '#e9ecef',
  },
  videoInfoContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    lineHeight: 20,
  },
  videoUploader: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  videoMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoDuration: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#e9ecef',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  videoDate: {
    fontSize: 12,
    color: '#666',
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  guestNotice: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFEAA7',
  },
  guestNoticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  guestNoticeText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
});
