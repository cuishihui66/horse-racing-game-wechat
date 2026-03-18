import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().default(3000),
  JWT_SECRET: Joi.string().default('local-dev-jwt-secret'),
  DEV_AUTH_MODE: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(true),
  DEV_HOST_USERNAME: Joi.string().default('admin'),
  DEV_HOST_PASSWORD: Joi.string().default('password'),
  WECHAT_APP_ID: Joi.string().allow('').default(''),
  WECHAT_APP_SECRET: Joi.string().allow('').default(''),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().default('postgres'),
  DB_DATABASE: Joi.string().default('horse_racing'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  MINIPROGRAM_BASE_URL: Joi.string().uri().default('https://local.dev/game?sessionId='),
  WALL_MINIPROGRAM_BASE_URL: Joi.string().uri().default('https://local.dev/wall?sessionId='),
});
