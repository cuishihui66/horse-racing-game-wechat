// backend/src/game/game.module.ts
import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSession } from './entities/game-session.entity';
import { Participant } from './entities/participant.entity';
import { User } from '../auth/entities/user.entity';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GameGateway } from './game.gateway';
import { AuthModule } from '../auth/auth.module';
import { GameController } from './game.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameSession, Participant, User]),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'single', // Or 'cluster' for Redis cluster
        url: `redis://${configService.get<string>('redis.host')}:${configService.get<number>('redis.port')}`,
      }),
      inject: [ConfigService],
    }),
    AuthModule, // Import AuthModule to use JwtService and other auth components
    ConfigModule, // Make ConfigService available
  ],
  providers: [GameService, GameGateway],
  controllers: [GameController],
  exports: [GameService, GameGateway], // Export for use in other modules if needed
})
export class GameModule {}
