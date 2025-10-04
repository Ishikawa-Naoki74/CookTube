# CookTube - 動画レシピ自動生成アプリ 要件定義書

## プロジェクト概要
YouTube動画からAIが自動でレシピを生成し、材料リストと手順を構造化するWebアプリケーション（モバイル対応）

## MVP機能一覧

### 1. 基本機能（必須）

#### 1.1 認証機能
- ユーザー登録・ログイン機能
- ゲスト利用モード対応
- セッション管理

#### 1.2 動画解析機能
- **YouTubeリンク入力**
  - URL入力フィールド
  - 動画情報の取得・表示（タイトル、サムネイル）
  
- **AI解析処理**
  - 音声からテキスト化（Amazon Transcribe）
  - 映像から食材認識（Amazon Rekognition）
  - AI生成による材料・手順の構造化（Amazon Bedrock）

#### 1.3 レシピ管理機能
- **生成されたレシピの表示**
  - 材料リスト（分量付き）
  - 調理手順のステップ表示
  - 元動画へのリンク

- **CRUD操作**
  - レシピの保存
  - 保存済みレシピ一覧
  - レシピの編集・削除

### 2. AI機能詳細

#### 2.1 音声解析機能（Amazon Transcribe）
- **動画音声のテキスト化**
  - 動画や音声を入力 → 自動で文字起こし
  - 材料名や調理の説明をテキスト化
  - 日本語・英語など多言語対応
  - タイムスタンプ付きテキスト出力

#### 2.2 画像認識機能（Amazon Rekognition）
- **食材・調理器具の認識**
  - 動画のサムネイルやキャプチャから食材を検出
  - 例：玉ねぎ、トマト、フライパン、包丁など
  - 音声だけでは曖昧な材料の補完

#### 2.3 AI生成機能（Amazon Bedrock）
- **構造化されたレシピ生成**
  - Transcribe（音声テキスト）+ Rekognition（画像ラベル）を統合
  - 「材料リスト」「分量」「手順」に構造化
  - 曖昧な量の推測・補完（例：「少々」→「塩ひとつまみ」）

### 3. UI/UX（Expo対応）

#### 3.1 画面構成
- **トップ画面**
  - YouTubeリンク入力フィールド
  - 最近生成したレシピのサマリー
  
- **解析画面**
  - 処理中のローディング表示
  - 進行状況の表示
  
- **レシピ表示画面**
  - 材料リストチェックボックス付き（買い物リスト機能）
  - 手順のステップ表示
  - 元動画へのリンク
  
- **レシピ一覧画面**
  - 保存済みレシピのカード形式表示
  - 検索・フィルタリング機能

### 4. 拡張機能（Nice to Have）

- **買い物リスト機能**
  - 材料のチェックボックス
  - 複数レシピの材料統合
  - 買い物リストの共有機能

- **YouTube API連携強化**
  - 説明欄からの材料情報取得
  - 字幕データの活用

- **多言語対応**
  - Amazon Translateによる英語レシピの日本語変換
  - インターフェースの多言語化

## 技術スタック

### フロントエンド・モバイル
- Expo / React Native
- TypeScript
- React Navigation（ナビゲーション）
- React Query（データフェッチング）
- AsyncStorage（ローカルストレージ）

### バックエンド
- Node.js/Express または Next.js API Routes
- PostgreSQL/Supabase
- Prisma ORM

### AI/ML（AWS）
- **Amazon Transcribe**（音声→テキスト変換）
- **Amazon Rekognition**（画像認識）
- **Amazon Bedrock**（LLM、Claude/Titan/Llama）
- YouTube Data API v3

### 認証
- Expo AuthSession
- JWT
- OAuth 2.0

### デプロイ
- Expo Application Services（EAS）
- Vercel（バックエンドAPI）
- Supabase（データベース）
- AWS（AIサービス）

## データモデル

### User
```
- id: UUID
- email: string (unique)
- name: string
- created_at: timestamp
- is_guest: boolean
```

### Recipe
```
- id: UUID
- user_id: UUID (FK)
- youtube_url: string
- video_title: string
- video_thumbnail: string
- ingredients: JSON[]
  - name: string
  - amount: string
  - unit: string
- steps: JSON[]
  - step_number: integer
  - description: text
  - timestamp: float (optional)
- transcription_text: text
- recognition_labels: JSON[]
- created_at: timestamp
- updated_at: timestamp
```

### ProcessingJob
```
- id: UUID
- user_id: UUID (FK)
- youtube_url: string
- status: enum ('pending', 'transcribing', 'recognizing', 'generating', 'completed', 'failed')
- progress_percent: integer
- error_message: text (nullable)
- created_at: timestamp
```

## 全体フロー（MVP）

1. **ユーザー入力**
   - YouTubeリンクをユーザーが入力

2. **動画処理**
   - バックエンドで動画の音声を抽出
   - Transcribeで文字起こし実行

3. **画像解析**
   - Rekognitionでサムネイルやキャプチャから材料を補足

4. **AI生成**
   - Bedrockで以下を生成：
     - 材料＋分量リスト
     - 手順リスト

5. **結果表示**
   - アプリ画面で表示（買い物リスト化対応）

## 開発フェーズ

### Phase 1: 基本機能実装（2-3週間）
1. Expoプロジェクトセットアップ
2. 認証機能実装
3. YouTube URL入力・バリデーション
4. 基本UI実装

### Phase 2: AWS AI機能統合（2週間）
1. Amazon Transcribe連携
2. Amazon Rekognition連携
3. Amazon Bedrock連携
4. 処理状況の表示

### Phase 3: レシピ管理機能（1週間）
1. レシピ保存・一覧機能
2. 買い物リスト機能
3. UI/UXブラッシュアップ

## 成功指標（KPI）

- ユーザー登録数
- レシピ生成成功率
- 処理完了時間（平均）
- リテンション率（7日、30日）
- 生成精度（ユーザーフィードバックベース）

## セキュリティ要件

- HTTPS通信必須
- AWS認証情報の適切な管理
- APIキーの環境変数管理
- レート制限実装
- ユーザーデータの暗号化

## テスト戦略

- 単体テスト（Jest）
- 統合テスト
- E2Eテスト（Detox for React Native）
- AI出力の品質チェック
- パフォーマンステスト

## 運用・保守

- エラーログ収集（Sentry）
- AWS CloudWatchによるモニタリング
- 定期的なバックアップ
- AI使用量のコスト管理
- レスポンス時間の監視

## 今後の拡張可能性

- 栄養情報の自動計算
- アレルギー情報の警告機能
- レシピのカスタマイズ機能
- コミュニティ機能（レシピ共有）
- 音声入力対応
- オフライン機能（部分的）

# チケット管理

## Todoの管理方法
各チケットファイル（/docs配下）でのタスク管理は以下のルールに従ってください：

### チェックボックス形式
- 未完了: `- [ ] タスク名`
- 完了: `- [×] タスク名`

### 例
```markdown
### 認証システム
- [×] JWT認証の実装
- [×] ユーザー登録API
- [ ] ログインAPI
- [ ] ログアウト機能
```

### 更新タイミング
- タスク開始時: チェックボックスはそのまま
- タスク完了時: `- [ ]` を `- [×]` に変更
- 進行状況は随時更新

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.