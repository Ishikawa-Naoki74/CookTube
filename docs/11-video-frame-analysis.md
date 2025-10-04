# 動画フレーム分析機能 実装ガイド

## 概要
YouTube動画をフレーム単位で分析し、AIによって食材・調理器具・調理動作を検出して、時系列で構造化されたレシピを生成する機能を実装します。

## アーキテクチャ

### 処理フロー
```
1. YouTube動画ダウンロード
   ↓
2. FFmpegでフレーム分割（1-2秒間隔）
   ↓
3. 各フレームをS3にアップロード
   ↓
4. Amazon Rekognitionで解析
   - 食材検出（Custom Labels）
   - 調理器具検出
   - 一般オブジェクト検出
   ↓
5. 調理アクション認識
   - 連続フレーム分析
   - 動作パターン認識
   ↓
6. 時系列データ統合
   - フレームごとの情報を時間軸で整理
   - 重複除去と正規化
   ↓
7. Amazon Bedrockでレシピ生成
   - 構造化データから手順を生成
   - 材料リストの整理
```

## 実装タスク

### Phase 1: 動画処理基盤
- [×] 動画処理パイプラインの設計
- [ ] FFmpegを使った動画フレーム分割機能
- [ ] S3へのフレーム画像アップロード
- [ ] 処理ジョブ管理システム

### Phase 2: AI画像解析
- [ ] Amazon Rekognition統合
- [ ] 食材検出用Custom Labelsのトレーニング
- [ ] 調理器具検出機能
- [ ] バッチ処理による効率化

### Phase 3: 動作認識とレシピ生成
- [ ] 調理アクション認識モデルの実装
- [ ] 時系列データの統合処理
- [ ] Amazon Bedrockによるレシピ構造化
- [ ] 精度向上のための後処理

### Phase 4: API統合とUI
- [ ] 動画解析APIエンドポイント
- [ ] 処理状況のリアルタイム更新
- [ ] フロントエンドとの統合
- [ ] エラーハンドリングとリトライ

## 技術詳細

### フレーム分割設定
```javascript
{
  frameInterval: 2,        // 2秒ごとに1フレーム
  maxFrames: 300,         // 最大300フレーム（10分動画想定）
  resolution: '1280x720', // HD解像度
  format: 'jpeg',         // JPEG形式で保存
  quality: 85            // 画質85%
}
```

### Rekognition設定
```javascript
{
  // 食材検出
  customLabels: {
    projectArn: 'arn:aws:rekognition:...',
    minConfidence: 70
  },
  // 一般オブジェクト検出
  detectLabels: {
    maxLabels: 20,
    minConfidence: 75
  },
  // テキスト検出（レシピカードなど）
  detectText: {
    filters: {
      wordFilter: {
        minConfidence: 80
      }
    }
  }
}
```

### 調理アクション分類
```javascript
const cookingActions = {
  'cutting': ['slice', 'dice', 'chop', 'mince'],
  'heating': ['fry', 'boil', 'steam', 'bake', 'grill'],
  'mixing': ['stir', 'whisk', 'fold', 'blend'],
  'preparation': ['wash', 'peel', 'drain', 'marinate'],
  'plating': ['serve', 'garnish', 'arrange']
};
```

## データベーススキーマ

### VideoAnalysisJob
```sql
- id: UUID
- recipe_id: UUID (FK)
- youtube_url: string
- status: enum
- total_frames: integer
- processed_frames: integer
- created_at: timestamp
- completed_at: timestamp
```

### FrameAnalysis
```sql
- id: UUID
- job_id: UUID (FK)
- frame_number: integer
- timestamp_seconds: float
- s3_url: string
- detected_ingredients: JSON[]
- detected_tools: JSON[]
- detected_actions: JSON[]
- confidence_scores: JSON
- created_at: timestamp
```

### RecipeStep
```sql
- id: UUID
- recipe_id: UUID (FK)
- step_number: integer
- action: string
- ingredients: JSON[]
- tools: JSON[]
- duration_seconds: integer
- video_timestamp: float
- description: text
```

## コスト最適化

### 処理の最適化
1. **インテリジェントフレーム選択**
   - 動きの大きい部分を優先
   - 静止画の重複を除去

2. **バッチ処理**
   - 複数フレームを一括処理
   - API呼び出し回数の削減

3. **キャッシング**
   - 類似動画の結果を再利用
   - 共通食材のラベルをキャッシュ

### 料金見積もり
```
月間1000動画処理の場合：
- S3ストレージ: $10
- Rekognition: $100-150
- Bedrock: $50
- Lambda実行: $20
- 合計: 約$200/月
```

## エラーハンドリング

### リトライ戦略
```javascript
const retryConfig = {
  maxAttempts: 3,
  backoffMultiplier: 2,
  initialDelay: 1000,
  maxDelay: 10000
};
```

### エラー種別と対処
1. **動画ダウンロード失敗**
   - 別の解像度で再試行
   - プロキシ経由でのダウンロード

2. **フレーム処理タイムアウト**
   - フレーム数を削減
   - 低解像度で処理

3. **AI API制限**
   - レート制限の実装
   - キューイングシステム

## パフォーマンス目標

- 5分動画の処理時間: 2分以内
- フレーム分析精度: 85%以上
- 手順生成精度: 90%以上
- 同時処理数: 10動画

## セキュリティ考慮事項

1. **S3アクセス制御**
   - 一時的な署名付きURL
   - バケットポリシーの適切な設定

2. **API認証**
   - IAMロールベースのアクセス
   - APIキーのローテーション

3. **データプライバシー**
   - 処理済みフレームの定期削除
   - ユーザーデータの暗号化

## 今後の拡張

1. **リアルタイム処理**
   - ストリーミング対応
   - ライブクッキング配信対応

2. **高度な分析**
   - 調理技術の評価
   - 栄養成分の推定
   - 調理時間の最適化提案

3. **マルチモーダル統合**
   - 音声と映像の同期分析
   - 字幕データとの統合