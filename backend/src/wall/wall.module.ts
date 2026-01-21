// backend/src/wall/wall.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WallMessage } from './entities/wall-message.entity';
import { WallService } from './wall.service';
import { WallController } from './wall.controller';
import { WallGateway } from './wall.gateway';
import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../game/game.module'; // To access GameSession and related info
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([WallMessage]),
    AuthModule, // To use User entity and JWT
    GameModule, // To get GameSession details
    ConfigModule,
  ],
  providers: [WallService, WallGateway],
  controllers: [WallController],
  exports: [WallService, WallGateway],
})
export class WallModule {}
