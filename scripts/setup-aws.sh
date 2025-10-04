#!/bin/bash

# AWS CLIを使った手動セットアップスクリプト
# 使用前に `aws configure` で認証情報を設定してください

echo "🚀 CookTube AWS セットアップを開始します..."

# 変数設定
REGION="ap-northeast-1"
BUCKET_NAME="cooktube-media-$(date +%s)"
USER_NAME="cooktube-service-user"
POLICY_PREFIX="CookTube"

# S3バケット作成
echo "📦 S3バケットを作成中..."
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION

# CORS設定
cat > /tmp/cors.json << EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedOrigins": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws s3api put-bucket-cors --bucket $BUCKET_NAME --cors-configuration file:///tmp/cors.json

# IAMユーザー作成
echo "👤 IAMユーザーを作成中..."
aws iam create-user --user-name $USER_NAME

# ポリシー作成と適用
echo "📋 IAMポリシーを作成中..."

# 統合ポリシー
cat > /tmp/cooktube-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob",
        "transcribe:ListTranscriptionJobs",
        "transcribe:DeleteTranscriptionJob"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:DetectLabels",
        "rekognition:DetectText"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::$BUCKET_NAME",
        "arn:aws:s3:::$BUCKET_NAME/*"
      ]
    }
  ]
}
EOF

# ポリシー作成
POLICY_ARN=$(aws iam create-policy \
  --policy-name "${POLICY_PREFIX}ServicePolicy" \
  --policy-document file:///tmp/cooktube-policy.json \
  --query 'Policy.Arn' \
  --output text)

# ポリシーをユーザーにアタッチ
aws iam attach-user-policy \
  --user-name $USER_NAME \
  --policy-arn $POLICY_ARN

# アクセスキー作成
echo "🔑 アクセスキーを作成中..."
ACCESS_KEY_RESULT=$(aws iam create-access-key --user-name $USER_NAME)

ACCESS_KEY_ID=$(echo $ACCESS_KEY_RESULT | jq -r '.AccessKey.AccessKeyId')
SECRET_ACCESS_KEY=$(echo $ACCESS_KEY_RESULT | jq -r '.AccessKey.SecretAccessKey')

# 結果を表示
echo ""
echo "✅ セットアップが完了しました！"
echo ""
echo "以下の情報を cooktube-api/.env ファイルに追加してください："
echo "================================================"
echo "AWS_ACCESS_KEY_ID=\"$ACCESS_KEY_ID\""
echo "AWS_SECRET_ACCESS_KEY=\"$SECRET_ACCESS_KEY\""
echo "AWS_REGION=\"$REGION\""
echo "AWS_S3_BUCKET=\"$BUCKET_NAME\""
echo "================================================"
echo ""
echo "⚠️  重要: Secret Access Keyは安全に保管してください。再取得はできません。"

# 一時ファイル削除
rm /tmp/cors.json /tmp/cooktube-policy.json