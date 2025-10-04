import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { RecipeApiClient } from '../../lib/recipe-api';
import { ProcessingJob } from '../../types/api';
import { Ionicons } from '@expo/vector-icons';

export default function ProcessingScreen() {
  const params = useLocalSearchParams();
  const jobId = params.jobId as string;
  const videoTitle = params.videoTitle as string;
  const videoThumbnail = params.videoThumbnail as string;
  
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setError('ジョブIDが見つかりません');
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const jobStatus = await RecipeApiClient.getJobStatus(jobId);
        setJob(jobStatus);

        // Stop polling when completed or failed
        if (jobStatus.status === 'completed') {
          clearInterval(pollInterval);
          // Navigate to recipe screen
          router.push({
            pathname: '/recipe/[id]',
            params: { id: jobId }
          });
        } else if (jobStatus.status === 'failed') {
          clearInterval(pollInterval);
          setError(jobStatus.errorMessage || 'Recipe generation failed');
        }
      } catch (error) {
        console.error('Job status fetch error:', error);
        setError('Failed to get status');
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [jobId]);

  const getStatusMessage = (status: string | undefined) => {
    switch (status) {
      case 'pending':
        return 'Starting process...';
      case 'transcribing':
        return 'Analyzing video audio...';
      case 'recognizing':
        return 'Recognizing ingredients from video...';
      case 'generating':
        return 'Generating recipe...';
      case 'completed':
        return 'Recipe generation completed!';
      case 'failed':
        return 'An error occurred';
      default:
        return 'Processing...';
    }
  };

  const getStatusIcon = (status: string | undefined) => {
    switch (status) {
      case 'transcribing':
        return 'mic-outline';
      case 'recognizing':
        return 'camera-outline';
      case 'generating':
        return 'create-outline';
      case 'completed':
        return 'checkmark-circle-outline';
      case 'failed':
        return 'alert-circle-outline';
      default:
        return 'time-outline';
    }
  };

  const getProgressColor = (status: string | undefined) => {
    if (status === 'failed') return '#FF6B6B';
    if (status === 'completed') return '#4CAF50';
    return '#2196F3';
  };

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#FF6B6B" />
          <Text style={styles.errorTitle}>エラーが発生しました</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {videoThumbnail && (
        <Image source={{ uri: videoThumbnail }} style={styles.thumbnail} />
      )}
      
      <View style={styles.contentContainer}>
        {videoTitle && (
          <Text style={styles.videoTitle} numberOfLines={2}>{videoTitle}</Text>
        )}

        <View style={styles.statusContainer}>
          <View style={styles.iconContainer}>
            <Ionicons 
              name={getStatusIcon(job?.status) as any} 
              size={48} 
              color={getProgressColor(job?.status)} 
            />
            {job?.status !== 'completed' && job?.status !== 'failed' && (
              <ActivityIndicator 
                size="large" 
                color={getProgressColor(job?.status)} 
                style={styles.spinner}
              />
            )}
          </View>

          <Text style={styles.statusMessage}>
            {getStatusMessage(job?.status)}
          </Text>

          {job?.progressPercent !== undefined && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${job.progressPercent}%`,
                      backgroundColor: getProgressColor(job.status)
                    }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {job.progressPercent}%
              </Text>
            </View>
          )}
        </View>

        <View style={styles.stepsContainer}>
          <StepIndicator 
            label="Audio Analysis" 
            status={getStepStatus(job?.status, 'transcribing')}
          />
          <StepIndicator 
            label="Image Recognition" 
            status={getStepStatus(job?.status, 'recognizing')}
          />
          <StepIndicator 
            label="Recipe Generation" 
            status={getStepStatus(job?.status, 'generating')}
          />
        </View>
      </View>
    </View>
  );
}

function StepIndicator({ label, status }: { label: string; status: 'waiting' | 'active' | 'completed' }) {
  const getIcon = () => {
    switch (status) {
      case 'completed':
        return <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />;
      case 'active':
        return <ActivityIndicator size="small" color="#2196F3" />;
      default:
        return <Ionicons name="ellipse-outline" size={24} color="#CCCCCC" />;
    }
  };

  return (
    <View style={styles.stepIndicator}>
      {getIcon()}
      <Text style={[
        styles.stepLabel,
        status === 'active' && styles.stepLabelActive,
        status === 'completed' && styles.stepLabelCompleted
      ]}>
        {label}
      </Text>
    </View>
  );
}

function getStepStatus(
  jobStatus: string | undefined, 
  stepName: string
): 'waiting' | 'active' | 'completed' {
  const statusOrder = ['pending', 'transcribing', 'recognizing', 'generating', 'completed'];
  const currentIndex = statusOrder.indexOf(jobStatus || 'pending');
  const stepIndex = statusOrder.indexOf(stepName);

  if (currentIndex > stepIndex) return 'completed';
  if (currentIndex === stepIndex) return 'active';
  return 'waiting';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  thumbnail: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  contentContainer: {
    flex: 1,
    padding: 20,
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  statusContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 16,
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    position: 'absolute',
  },
  statusMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#999',
  },
  stepsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepLabel: {
    marginLeft: 12,
    fontSize: 16,
    color: '#999',
  },
  stepLabelActive: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  stepLabelCompleted: {
    color: '#4CAF50',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});