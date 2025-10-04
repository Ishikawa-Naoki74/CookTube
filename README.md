# CookTube - AI Recipe Generator

CookTube is a mobile and web application that automatically generates structured recipes from YouTube cooking videos using AI-powered video analysis.

## Features

- **YouTube Video Analysis**: Extract recipes from YouTube cooking videos
- **AI-Powered Processing**: Uses AWS Transcribe, Rekognition, and Bedrock for intelligent analysis
- **Mobile App**: React Native/Expo app for iOS and Android
- **Recipe Management**: Save, edit, and organize your generated recipes
- **Shopping Lists**: Create shopping lists from recipe ingredients
- **Guest Mode**: Try the app without registration
- **User Authentication**: Secure JWT-based authentication

## Architecture

### Mobile App (CookTubeMobile)
- **Framework**: Expo/React Native with TypeScript
- **Navigation**: Expo Router with tabs and stack navigation
- **State Management**: React Context for authentication
- **Storage**: Expo SecureStore for tokens, AsyncStorage for app data
- **UI**: Custom React Native components with consistent design system

### Backend API (cooktube-api)
- **Framework**: Next.js 15 with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT tokens with bcrypt password hashing
- **AI Services**: AWS Transcribe, Rekognition, and Bedrock
- **Video Processing**: YouTube-dl for audio/thumbnail extraction

### AI Processing Pipeline
1. **Video Analysis**: Download audio and thumbnail from YouTube
2. **Audio Transcription**: AWS Transcribe converts speech to text
3. **Image Recognition**: AWS Rekognition identifies ingredients and tools
4. **Recipe Generation**: AWS Bedrock (Claude) generates structured recipes
5. **Data Storage**: Save recipes with ingredients, steps, and metadata

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Expo CLI (`npm install -g @expo/cli`)
- PostgreSQL database
- AWS account with Transcribe, Rekognition, and Bedrock access
- YouTube Data API key (optional)

### Environment Setup

#### Backend (.env in cooktube-api/)
```env
DATABASE_URL="postgresql://username:password@localhost:5432/cooktube"
NEXTAUTH_SECRET="your-nextauth-secret-key"
JWT_SECRET="your-jwt-secret-key"

# AWS Configuration
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="us-east-1"
AWS_S3_BUCKET="your-s3-bucket-name"

# Optional APIs
YOUTUBE_API_KEY="your-youtube-api-key"
OPENAI_API_KEY="your-openai-api-key"
```

#### Mobile App (.env in CookTubeMobile/)
```env
EXPO_PUBLIC_API_URL="http://localhost:3000/api"
```

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CookTube
   ```

2. **Setup Backend API**
   ```bash
   cd cooktube-api
   npm install
   npx prisma migrate dev
   npm run dev
   ```

3. **Setup Mobile App**
   ```bash
   cd ../CookTubeMobile
   npm install
   npm start
   ```

4. **Using Docker (Alternative)**
   ```bash
   # Set environment variables in .env file
   docker-compose up --build
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/guest` - Create guest user
- `GET /api/auth/me` - Get current user

### Recipes
- `POST /api/recipes/generate` - Start recipe generation from YouTube URL
- `GET /api/recipes/status/:jobId` - Check processing job status
- `GET /api/recipes` - Get user's recipes
- `GET /api/recipes/:id` - Get specific recipe
- `PUT /api/recipes/:id` - Update recipe
- `DELETE /api/recipes/:id` - Delete recipe

### Shopping Lists
- `GET /api/shopping-lists` - Get user's shopping lists
- `POST /api/shopping-lists` - Create shopping list
- `PUT /api/shopping-lists/:id` - Update shopping list
- `DELETE /api/shopping-lists/:id` - Delete shopping list
- `POST /api/shopping-lists/from-recipe/:recipeId` - Create shopping list from recipe

## Testing

### Mobile App Tests
```bash
cd CookTubeMobile
npm test
npm run test:coverage
```

### Backend Tests
```bash
cd cooktube-api
npm test
npm run test:coverage
```

## Deployment

### Mobile App
1. **Build for Production**
   ```bash
   cd CookTubeMobile
   expo build:ios
   expo build:android
   ```

2. **Deploy with EAS**
   ```bash
   npm install -g @expo/eas-cli
   eas build
   eas submit
   ```

### Backend API
1. **Deploy to Vercel**
   ```bash
   cd cooktube-api
   vercel --prod
   ```

2. **Deploy with Docker**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

## Database Schema

### Users
- Authentication and profile information
- Guest user support

### Recipes
- Generated recipe data with ingredients and steps
- Links to original YouTube videos
- User ownership and timestamps

### Processing Jobs
- Track AI processing status and progress
- Error handling and retry logic

### Shopping Lists
- User-created shopping lists
- Recipe-to-shopping-list conversion

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check the documentation in the `/docs` folder
- Review the API documentation

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐
│   Mobile App    │    │   Web Frontend  │
│ (React Native)  │    │   (Optional)    │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          └──────┬─────────────────┘
                 │ HTTPS/REST API
         ┌───────▼─────────┐
         │   Next.js API   │
         │   (cooktube-api)│
         └─────────┬───────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
┌───▼───┐    ┌─────▼─────┐   ┌────▼────┐
│PostgreSQL│  │AWS Services│ │YouTube-dl│
│(Prisma) │  │Transcribe │   │Video Proc│
└─────────┘  │Rekognition│   └─────────┘
             │Bedrock    │
             └───────────┘
```
