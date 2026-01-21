// backend/src/game/dto/join-game.dto.ts
import { IsString, IsOptional } from 'class-validator';

export class JoinGameDto {
  @IsString()
  wechatNickname: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
