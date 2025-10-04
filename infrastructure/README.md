# CookTube AWS Infrastructure

AWS CDKを使用してCookTubeに必要なAWSリソースを自動作成します。

## 作成されるリソース

- **IAMユーザー**: cooktube-service-user
- **S3バケット**: cooktube-media-{account}-{region}
- **IAMポリシー**:
  - Amazon Transcribe（音声→テキスト）
  - Amazon Rekognition（画像認識）
  - Amazon Bedrock（AI生成）
  - S3（ファイル管理）

## セットアップ手順

### 1. AWS CLIの設定
```bash
# AWS CLIをインストール
brew install awscli  # Mac
# または https://aws.amazon.com/cli/ から

# AWS認証情報を設定
aws configure
# Access Key ID: [管理者権限のあるIAMユーザーのキー]
# Secret Access Key: [シークレットキー]
# Default region: ap-northeast-1
# Default output format: json
```

### 2. CDKのインストール
```bash
# グローバルにCDKをインストール
npm install -g aws-cdk

# CDKブートストラップ（初回のみ）
cdk bootstrap aws://ACCOUNT-NUMBER/ap-northeast-1
```

### 3. インフラのデプロイ
```bash
cd infrastructure
npm install
npm run deploy
```

### 4. 出力された認証情報を保存
デプロイ完了後、以下の情報が表示されます：
- **BucketName**: S3バケット名
- **AccessKeyId**: AWSアクセスキー
- **SecretAccessKey**: AWSシークレットキー（安全に保管）
- **Region**: リージョン

これらを`cooktube-api/.env`に設定してください。

### 5. リソースの削除
```bash
npm run destroy
```

## 注意事項

- Bedrockを使用する場合、事前にモデルアクセスをリクエストする必要があります
- S3バケットは1日後に自動削除される一時ファイル用のライフサイクルルールが設定されています
- 本番環境では、より厳密な権限設定を推奨します