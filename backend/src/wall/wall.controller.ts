import { Controller, Post, Body, Param, Get, UseGuards, Request, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { WallService } from './wall.service';
import { SubmitWallMessageDto } from './dto/submit-wall-message.dto';
import { User } from '../auth/entities/user.entity';

@Controller('wall')
export class WallController {
  constructor(private readonly wallService: WallService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/submit')
  async submitMessage(
    @Param('gameSessionId') gameSessionId: string,
    @Body() submitWallMessageDto: SubmitWallMessageDto,
    @Request() req: { user: User },
  ) {
    return this.wallService.submitWallMessage(
      gameSessionId,
      req.user.id,
      submitWallMessageDto.type,
      submitWallMessageDto.content,
      submitWallMessageDto.imageUrl,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return {
      imageUrl: `https://via.placeholder.com/150?text=Uploaded_Image_${Date.now()}`,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':gameSessionId/pending-messages')
  async getPendingMessages(
    @Param('gameSessionId') gameSessionId: string,
    @Request() req: { user: User },
  ) {
    return this.wallService.getPendingWallMessages(gameSessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':gameSessionId/approved-messages')
  async getApprovedMessages(
    @Param('gameSessionId') gameSessionId: string,
    @Request() req: { user: User },
  ) {
    return this.wallService.getApprovedWallMessages(gameSessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/message/:messageId/approve')
  async approveMessage(@Param('messageId') messageId: string, @Request() req: { user: User }) {
    return this.wallService.approveWallMessage(messageId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/message/:messageId/reject')
  async rejectMessage(@Param('messageId') messageId: string, @Request() req: { user: User }) {
    return this.wallService.rejectWallMessage(messageId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/message/:messageId/delete')
  async deleteMessage(@Param('messageId') messageId: string, @Request() req: { user: User }) {
    return this.wallService.deleteWallMessage(messageId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/message/:messageId/toggle-top')
  async toggleTopMessage(
    @Param('messageId') messageId: string,
    @Body('isTop') isTop: boolean,
    @Request() req: { user: User },
  ) {
    return this.wallService.toggleTopWallMessage(messageId, req.user.id, isTop);
  }
}
