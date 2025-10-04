import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class CookTubeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3バケット作成（動画・音声・画像保存用）
    const mediaBucket = new s3.Bucket(this, 'CookTubeMediaBucket', {
      bucketName: `cooktube-media-${this.account}-${this.region}`,
      versioned: false,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'delete-temp-files',
          prefix: 'temp/',
          expiration: cdk.Duration.days(1),
          enabled: true,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // IAMユーザー作成
    const cooktubeUser = new iam.User(this, 'CookTubeServiceUser', {
      userName: 'cooktube-service-user',
    });

    // Transcribe用ポリシー
    const transcribePolicy = new iam.Policy(this, 'TranscribePolicy', {
      policyName: 'CookTubeTranscribePolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'transcribe:StartTranscriptionJob',
            'transcribe:GetTranscriptionJob',
            'transcribe:ListTranscriptionJobs',
            'transcribe:DeleteTranscriptionJob',
          ],
          resources: ['*'],
        }),
      ],
    });

    // Rekognition用ポリシー
    const rekognitionPolicy = new iam.Policy(this, 'RekognitionPolicy', {
      policyName: 'CookTubeRekognitionPolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'rekognition:DetectLabels',
            'rekognition:DetectText',
            'rekognition:RecognizeCelebrities',
          ],
          resources: ['*'],
        }),
      ],
    });

    // Bedrock用ポリシー
    const bedrockPolicy = new iam.Policy(this, 'BedrockPolicy', {
      policyName: 'CookTubeBedrockPolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:ListFoundationModels',
          ],
          resources: ['*'],
        }),
      ],
    });

    // S3アクセスポリシー
    const s3Policy = new iam.Policy(this, 'S3Policy', {
      policyName: 'CookTubeS3Policy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
          ],
          resources: [
            mediaBucket.bucketArn,
            `${mediaBucket.bucketArn}/*`,
          ],
        }),
      ],
    });

    // ポリシーをユーザーにアタッチ
    cooktubeUser.attachInlinePolicy(transcribePolicy);
    cooktubeUser.attachInlinePolicy(rekognitionPolicy);
    cooktubeUser.attachInlinePolicy(bedrockPolicy);
    cooktubeUser.attachInlinePolicy(s3Policy);

    // アクセスキー作成
    const accessKey = new iam.AccessKey(this, 'CookTubeAccessKey', {
      user: cooktubeUser,
    });

    // 出力（環境変数用）
    new cdk.CfnOutput(this, 'BucketName', {
      value: mediaBucket.bucketName,
      description: 'S3 Bucket name for media files',
    });

    new cdk.CfnOutput(this, 'AccessKeyId', {
      value: accessKey.accessKeyId,
      description: 'AWS Access Key ID',
    });

    new cdk.CfnOutput(this, 'SecretAccessKey', {
      value: accessKey.secretAccessKey.unsafeUnwrap(),
      description: 'AWS Secret Access Key - SAVE THIS SECURELY!',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });
  }
}