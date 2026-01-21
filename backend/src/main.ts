import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { RedisClient } from 'redis';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // CORS for REST APIs
  app.enableCors({
    origin: '*', // Adjust for production, e.g., ['http://localhost:3000', 'http://your-host-panel-domain.com']
    credentials: true,
  });

  // Redis Adapter for Socket.IO scaling (for multiple backend instances)
  // Note: For a single instance, this is not strictly necessary but good for future scaling
  const pubClient = new RedisClient({ host: configService.get<string>('redis.host'), port: configService.get<number>('redis.port') });
  const subClient = pubClient.duplicate();
  const redisAdapter = createAdapter(pubClient, subClient);
  app.useWebSocketAdapter(new IoAdapter(app, {
    cors: {
      origin: '*', // Adjust for production, e.g., ['http://localhost:3000', 'http://your-host-panel-domain.com']
    },
    adapter: redisAdapter,
  }));

  const port = configService.get<number>('port');
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
