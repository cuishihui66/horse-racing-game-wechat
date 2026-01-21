// backend/src/wall/dto/submit-wall-message.dto.ts
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { WallMessageType } from '../entities/wall-message.entity';

export class SubmitWallMessageDto {
  @IsEnum(WallMessageType)
  type: WallMessageType;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '消息内容不能超过200个字符' })
  content?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string; // URL of the uploaded image
}
