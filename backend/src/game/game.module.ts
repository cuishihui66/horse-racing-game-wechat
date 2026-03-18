import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule, RedisModuleOptions } from '@nestjs-modules/ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';
import { GameSession } from './entities/game-session.entity';
import { Participant } from './entities/participant.entity';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameSession, Participant, User]),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): RedisModuleOptions =>
        ({
          config: {
            url: `redis://${configService.get<string>('redis.host')}:${configService.get<number>('redis.port')}`,
          },
        }) as RedisModuleOptions,
      inject: [ConfigService],
    }),
    AuthModule,
    ConfigModule,
  ],
  providers: [GameService, GameGateway],
  controllers: [GameController],
  exports: [GameService, GameGateway],
})
export class GameModule {}
