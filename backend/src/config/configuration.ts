// backend/src/config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'your_strong_jwt_secret_here_replace_me', // IMPORTANT: Replace with a strong secret in production
  wechat: {
    appId: process.env.WECHAT_APP_ID,
    appSecret: process.env.WECHAT_APP_SECRET,
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10), // Use 5433 as per Docker setup
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'mysecretpassword', // As per Docker setup
    database: process.env.DB_DATABASE || 'postgres',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  miniprogramUrl: process.env.MINIPROGRAM_BASE_URL || 'https://your-miniprogram-domain.com/join?sessionId=', // Base URL for generating QR code links
});
