// backend/src/wall/wall.controller.ts
import { Controller, Post, Body, Param, Get, UseGuards, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WallService } from './wall.service';
import { SubmitWallMessageDto } from './dto/submit-wall-message.dto';
import { User } from '../auth/entities/user.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';

@Controller('wall')
export class WallController {
  constructor(
    private readonly wallService: WallService,
    private readonly configService: ConfigService,
  ) {}

  // --- Mini-Program API ---
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

  // Temporary image upload endpoint (will need robust storage like S3/COS in production)
  @UseGuards(AuthGuard('jwt'))
  @Post('upload')
  @UseInterceptors(FileInterceptor('file')) // 'file' is the field name for the uploaded file
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // In a real application, you would:
    // 1. Validate file type and size
    // 2. Upload to a persistent storage (e.g., AWS S3, Tencent COS, Alibaba OSS)
    // 3. Return the URL from the storage
    // For now, we'll simulate the upload by returning a mock URL or base64 encoded image
    // This is a basic placeholder; production needs proper file storage solutions.

    if (!file) {
      throw new Error('No file uploaded');
    }

    // Example: For development, you might save it locally or return a mock URL
    // const imageUrl = `/uploads/${file.originalname}`; // Or a more unique name
    const mockImageUrl = `https://via.placeholder.com/150?text=Uploaded_Image_${Date.now()}`;
    // Optionally, if saving locally:
    // const fs = await import('fs');
    // const path = await import('path');
    // const uploadDir = path.join(process.cwd(), 'uploads');
    // if (!fs.existsSync(uploadDir)) {
    //   fs.mkdirSync(uploadDir);
    // }
    // fs.writeFileSync(path.join(uploadDir, file.originalname), file.buffer);
    // const imageUrl = `http://localhost:${this.configService.get('port')}/uploads/${file.originalname}`;

    return { imageUrl: mockImageUrl };
  }


  // --- Host Panel API ---
  @UseGuards(AuthGuard('jwt'))
  @Get(':gameSessionId/pending-messages')
  async getPendingMessages(@Param('gameSessionId') gameSessionId: string, @Request() req: { user: User }) {
    // TODO: Verify if req.user is the host of the gameSession
    return this.wallService.getPendingWallMessages(gameSessionId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':gameSessionId/approved-messages')
  async getApprovedMessages(@Param('gameSessionId') gameSessionId: string, @Request() req: { user: User }) {
    // TODO: Verify if req.user is the host of the gameSession or allowed viewer
    return this.wallService.getApprovedWallMessages(gameSessionId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/message/:messageId/approve')
  async approveMessage(
    @Param('gameSessionId') gameSessionId: string,
    @Param('messageId') messageId: string,
    @Request() req: { user: User },
  ) {
    // Host verification is done inside WallService
    return this.wallService.approveWallMessage(messageId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/message/:messageId/reject')
  async rejectMessage(
    @Param('gameSessionId') gameSessionId: string,
    @Param('messageId') messageId: string,
    @Request() req: { user: User },
  ) {
    // Host verification is done inside WallService
    return this.wallService.rejectWallMessage(messageId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/message/:messageId/delete')
  async deleteMessage(
    @Param('gameSessionId') gameSessionId: string,
    @Param('messageId') messageId: string,
    @Request() req: { user: User },
  ) {
    // Host verification is done inside WallService
    return this.wallService.deleteWallMessage(messageId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':gameSessionId/message/:messageId/toggle-top')
  async toggleTopMessage(
    @Param('gameSessionId') gameSessionId: string,
    @Param('messageId') messageId: string,
    @Body('isTop') isTop: boolean,
    @Request() req: { user: User },
  ) {
    // Host verification is done inside WallService
    return this.wallService.toggleTopWallMessage(messageId, req.user.id, isTop);
  }
}
