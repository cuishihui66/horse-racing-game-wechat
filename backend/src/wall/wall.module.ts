import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WallMessage } from './entities/wall-message.entity';
import { WallService } from './wall.service';
import { WallController } from './wall.controller';
import { WallGateway } from './wall.gateway';
import { AuthModule } from '../auth/auth.module';
import { GameSession } from '../game/entities/game-session.entity';
import { User } from '../auth/entities/user.entity';
import { GameModule } from '../game/game.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WallMessage, GameSession, User]),
    AuthModule,
    ConfigModule,
    GameModule,
  ],
  providers: [WallService, WallGateway],
  controllers: [WallController],
  exports: [WallService, WallGateway],
})
export class WallModule {}
