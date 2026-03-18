export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'local-dev-jwt-secret',
  devAuthMode: process.env.DEV_AUTH_MODE !== 'false',
  devHostUsername: process.env.DEV_HOST_USERNAME || 'admin',
  devHostPassword: process.env.DEV_HOST_PASSWORD || 'password',
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'horse_racing',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  miniprogramUrl: process.env.MINIPROGRAM_BASE_URL || 'https://local.dev/game?sessionId=',
  wallMiniprogramUrl: process.env.WALL_MINIPROGRAM_BASE_URL || 'https://local.dev/wall?sessionId=',
});
