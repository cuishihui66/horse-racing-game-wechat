import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { WallMessage, WallMessageType, WallMessageStatus } from './entities/wall-message.entity';
import { User } from '../auth/entities/user.entity';
import { GameSession } from '../game/entities/game-session.entity';

@Injectable()
export class WallService {
  private readonly logger = new Logger(WallService.name);
  private socketServer: Server;
  private readonly sensitiveWords = ['fuck', 'shit', 'bitch', 'asshole'];

  constructor(
    @InjectRepository(WallMessage)
    private readonly wallMessageRepository: Repository<WallMessage>,
    @InjectRepository(GameSession)
    private readonly gameSessionRepository: Repository<GameSession>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  setSocketServer(server: Server) {
    this.socketServer = server;
  }

  private emitToDisplay(eventName: string, payload: unknown) {
    this.socketServer?.to('display-global').emit(eventName, payload);
  }

  private containsSensitiveWords(text: string): boolean {
    if (!text) {
      return false;
    }

    const lowerText = text.toLowerCase();
    return this.sensitiveWords.some((word) => lowerText.includes(word));
  }

  private serializeMessage(message: WallMessage) {
    return {
      id: message.id,
      messageId: message.id,
      gameSessionId: message.gameSession?.id,
      wechatNickname: message.wechatNickname,
      avatarUrl: message.avatarUrl,
      type: message.type,
      content: message.content,
      imageUrl: message.imageUrl,
      status: message.status,
      isTop: message.isTop,
      createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
      approvedAt: message.approvedAt instanceof Date ? message.approvedAt.toISOString() : message.approvedAt,
    };
  }

  private async getSessionOrThrow(gameSessionId: string, hostId?: string) {
    const session = await this.gameSessionRepository.findOne({
      where: { id: gameSessionId },
      relations: ['host'],
    });

    if (!session) {
      throw new NotFoundException('Game session not found');
    }

    if (hostId && session.host.id !== hostId) {
      throw new ForbiddenException('Only the session host can manage wall messages');
    }

    return session;
  }

  private async getMessageForModeration(messageId: string, hostId: string) {
    const message = await this.wallMessageRepository.findOne({
      where: { id: messageId },
      relations: ['gameSession', 'gameSession.host', 'user'],
    });

    if (!message) {
      throw new NotFoundException('Wall message not found');
    }

    if (message.gameSession.host.id !== hostId) {
      throw new ForbiddenException('Only the session host can manage wall messages');
    }

    return message;
  }

  async submitWallMessage(
    gameSessionId: string,
    userId: string,
    type: WallMessageType,
    content?: string,
    imageUrl?: string,
  ) {
    const session = await this.getSessionOrThrow(gameSessionId);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!content && !imageUrl) {
      throw new BadRequestException('Message content or image URL is required');
    }

    if (content && this.containsSensitiveWords(content)) {
      throw new BadRequestException('消息包含敏感词，无法发送');
    }

    const wallMessage = this.wallMessageRepository.create({
      gameSession: session,
      user,
      wechatNickname: user.wechatNickname || `用户${user.id.slice(0, 4)}`,
      avatarUrl: user.avatarUrl,
      type,
      content,
      imageUrl,
      status: WallMessageStatus.PENDING,
      isTop: false,
    });

    const savedMessage = await this.wallMessageRepository.save(wallMessage);
    const payload = this.serializeMessage(savedMessage);
    this.socketServer?.to(`host-${gameSessionId}`).emit('wall_message_pending', payload);
    return payload;
  }

  async getPendingWallMessages(gameSessionId: string, hostId?: string) {
    await this.getSessionOrThrow(gameSessionId, hostId);
    const messages = await this.wallMessageRepository.find({
      where: { gameSession: { id: gameSessionId }, status: WallMessageStatus.PENDING },
      relations: ['user', 'gameSession'],
      order: { createdAt: 'ASC' },
    });

    return messages.map((message) => this.serializeMessage(message));
  }

  async getApprovedWallMessages(gameSessionId: string, hostId?: string) {
    await this.getSessionOrThrow(gameSessionId, hostId);
    const messages = await this.wallMessageRepository.find({
      where: { gameSession: { id: gameSessionId }, status: WallMessageStatus.APPROVED },
      relations: ['user', 'gameSession'],
      order: { isTop: 'DESC', approvedAt: 'DESC' },
    });

    return messages.map((message) => this.serializeMessage(message));
  }

  async approveWallMessage(messageId: string, hostId: string) {
    const message = await this.getMessageForModeration(messageId, hostId);
    const hostUser = await this.userRepository.findOne({ where: { id: hostId } });
    if (!hostUser) {
      throw new NotFoundException('Host user not found');
    }

    message.status = WallMessageStatus.APPROVED;
    message.approvedAt = new Date();
    message.approvedBy = hostUser;
    const savedMessage = await this.wallMessageRepository.save(message);
    const payload = this.serializeMessage(savedMessage);

    this.socketServer?.to(message.gameSession.id).emit('wall_message_approved', payload);
    this.socketServer?.to(`host-${message.gameSession.id}`).emit('wall_message_approved', payload);
    this.emitToDisplay('wall_message_approved', payload);

    return payload;
  }

  async rejectWallMessage(messageId: string, hostId: string) {
    const message = await this.getMessageForModeration(messageId, hostId);
    message.status = WallMessageStatus.REJECTED;
    await this.wallMessageRepository.save(message);

    const payload = {
      id: message.id,
      messageId: message.id,
      gameSessionId: message.gameSession.id,
    };
    this.socketServer?.to(`host-${message.gameSession.id}`).emit('wall_message_deleted', payload);
    this.emitToDisplay('wall_message_deleted', payload);
    return { id: message.id, status: message.status };
  }

  async deleteWallMessage(messageId: string, hostId: string) {
    const message = await this.getMessageForModeration(messageId, hostId);
    await this.wallMessageRepository.remove(message);

    const payload = {
      id: message.id,
      messageId: message.id,
      gameSessionId: message.gameSession.id,
    };
    this.socketServer?.to(message.gameSession.id).emit('wall_message_deleted', payload);
    this.socketServer?.to(`host-${message.gameSession.id}`).emit('wall_message_deleted', payload);
    this.emitToDisplay('wall_message_deleted', payload);

    return { message: 'Message deleted successfully' };
  }

  async toggleTopWallMessage(messageId: string, hostId: string, isTop: boolean) {
    const message = await this.getMessageForModeration(messageId, hostId);
    message.isTop = isTop;
    const savedMessage = await this.wallMessageRepository.save(message);

    const payload = {
      id: savedMessage.id,
      messageId: savedMessage.id,
      gameSessionId: savedMessage.gameSession.id,
      updates: { isTop: savedMessage.isTop },
    };
    this.socketServer?.to(savedMessage.gameSession.id).emit('wall_message_updated', payload);
    this.socketServer?.to(`host-${savedMessage.gameSession.id}`).emit('wall_message_updated', payload);
    this.emitToDisplay('wall_message_updated', payload);

    return this.serializeMessage(savedMessage);
  }
}
