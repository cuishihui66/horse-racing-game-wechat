import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { validationSchema } from './config/validation-schema';
import { getTypeOrmConfig } from './database/typeorm.config';
import { AuthModule } from './auth/auth.module';
import { GameModule } from './game/game.module';
import { RedisModule } from '@nestjs-modules/ioredis';
import { WallModule } from './wall/wall.module'; // Import WallModule

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      validationSchema,
      isGlobal: true, // Makes ConfigService available everywhere
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => getTypeOrmConfig(configService),
      inject: [ConfigService],
    }),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'single', // Or 'cluster' for Redis cluster
        url: `redis://${configService.get<string>('redis.host')}:${configService.get<number>('redis.port')}`,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    GameModule,
    WallModule, // Add WallModule here
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
