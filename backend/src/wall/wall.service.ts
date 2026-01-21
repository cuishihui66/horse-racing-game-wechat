// backend/src/wall/wall.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WallMessage, WallMessageType, WallMessageStatus } from './entities/wall-message.entity';
import { User } from '../auth/entities/user.entity';
import { GameSession, GameSessionStatus } from '../game/entities/game-session.entity';
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io'; // Import Server for typing

@Injectable()
export class WallService {
  private readonly logger = new Logger(WallService.name);
  private socketServer: Server; // Reference to the Socket.IO server

  // Simple sensitive word list for demonstration
  private sensitiveWords = ['fuck', 'shit', 'bitch', 'asshole']; // Replace with actual sensitive word management

  constructor(
    @InjectRepository(WallMessage)
    private wallMessageRepository: Repository<WallMessage>,
    @InjectRepository(GameSession)
    private gameSessionRepository: Repository<GameSession>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Set the Socket.IO server instance. This is needed for WallService to broadcast events.
   * Called by WallGateway after initialization.
   */
  setSocketServer(server: Server) {
    this.socketServer = server;
  }

  // --- Utility for Sensitive Word Filtering ---
  private containsSensitiveWords(text: string): boolean {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return this.sensitiveWords.some(word => lowerText.includes(word));
  }

  // --- User/Mini-Program API ---
  async submitWallMessage(
    gameSessionId: string,
    userId: string,
    type: WallMessageType,
    content?: string,
    imageUrl?: string,
  ) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (!gameSession) {
      throw new NotFoundException('Game session not found');
    }
    // Check if wall message is allowed for this session (e.g., is_wall_enabled flag on GameSession)
    // For now, assume it's always enabled if session exists.

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!content && !imageUrl) {
      throw new BadRequestException('Message content or image URL is required');
    }

    // Sensitive word filtering
    if (content && this.containsSensitiveWords(content)) {
      this.logger.warn(`Sensitive content detected from user ${userId} in session ${gameSessionId}`);
      // Option 1: Reject message directly
      throw new BadRequestException('消息包含敏感词，无法发送。');
      // Option 2: Mark for review and notify host
      // status = WallMessageStatus.PENDING; // Already default
    }

    const wallMessage = this.wallMessageRepository.create({
      gameSession,
      user,
      wechatNickname: user.wechatNickname || `用户${user.id.substring(0, 4)}`, // Use nickname if available
      avatarUrl: user.avatarUrl,
      type,
      content,
      imageUrl,
      status: WallMessageStatus.PENDING, // Always pending for moderation
      isTop: false,
    });
    await this.wallMessageRepository.save(wallMessage);

    this.logger.log(`New wall message (${wallMessage.id}) submitted to session ${gameSessionId} by user ${userId}`);

    // Notify host panel about new pending message (via WebSocket)
    this.socketServer?.to(`host-${gameSessionId}`).emit('wall_message_pending', wallMessage);

    return wallMessage;
  }

  // --- Host Panel API ---

  async getPendingWallMessages(gameSessionId: string) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (!gameSession) {
      throw new NotFoundException('Game session not found');
    }
    return this.wallMessageRepository.find({
      where: { gameSession: { id: gameSessionId }, status: WallMessageStatus.PENDING },
      relations: ['user'], // Load user info
      order: { createdAt: 'ASC' },
    });
  }

  async getApprovedWallMessages(gameSessionId: string) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (!gameSession) {
      throw new NotFoundException('Game session not found');
    }
    return this.wallMessageRepository.find({
      where: { gameSession: { id: gameSessionId }, status: WallMessageStatus.APPROVED },
      relations: ['user'],
      order: { isTop: 'DESC', approvedAt: 'DESC' }, // Show top messages first, then by approval time
    });
  }

  async approveWallMessage(messageId: string, hostId: string) {
    const message = await this.wallMessageRepository.findOne({ where: { id: messageId }, relations: ['gameSession', 'user'] });
    if (!message) {
      throw new NotFoundException('Wall message not found');
    }
    // Verify if hostId is actually the host of the gameSession
    const hostUser = await this.userRepository.findOne({ where: { id: hostId } });
    if (!hostUser || message.gameSession.host.id !== hostId) {
      throw new ForbiddenException('Only the session host can approve messages');
    }

    message.status = WallMessageStatus.APPROVED;
    message.approvedAt = new Date();
    message.approvedBy = hostUser;
    await this.wallMessageRepository.save(message);

    this.logger.log(`Wall message (${message.id}) approved by host ${hostId} for session ${message.gameSession.id}`);
    // Broadcast to large screen (via WebSocket)
    this.socketServer?.to(message.gameSession.id).emit('wall_message_approved', {
      id: message.id,
      gameSessionId: message.gameSession.id,
      wechatNickname: message.wechatNickname,
      avatarUrl: message.avatarUrl,
      type: message.type,
      content: message.content,
      imageUrl: message.imageUrl,
      isTop: message.isTop,
      createdAt: message.createdAt.toISOString(),
    });

    return message;
  }

  async rejectWallMessage(messageId: string, hostId: string) {
    const message = await this.wallMessageRepository.findOne({ where: { id: messageId }, relations: ['gameSession'] });
    if (!message) {
      throw new NotFoundException('Wall message not found');
    }
    const hostUser = await this.userRepository.findOne({ where: { id: hostId } });
    if (!hostUser || message.gameSession.host.id !== hostId) {
      throw new ForbiddenException('Only the session host can reject messages');
    }

    message.status = WallMessageStatus.REJECTED;
    // message.approvedBy = hostUser; // Optional: record who rejected
    await this.wallMessageRepository.save(message);

    this.logger.log(`Wall message (${message.id}) rejected by host ${hostId} for session ${message.gameSession.id}`);
    // Optionally notify large screen to remove if it was mistakenly displayed (not in current '先审后上' flow)
    return message;
  }

  async deleteWallMessage(messageId: string, hostId: string) {
    const message = await this.wallMessageRepository.findOne({ where: { id: messageId }, relations: ['gameSession'] });
    if (!message) {
      throw new NotFoundException('Wall message not found');
    }
    const hostUser = await this.userRepository.findOne({ where: { id: hostId } });
    if (!hostUser || message.gameSession.host.id !== hostId) {
      throw new ForbiddenException('Only the session host can delete messages');
    }

    await this.wallMessageRepository.remove(message);
    this.logger.log(`Wall message (${message.id}) deleted by host ${hostId} from session ${message.gameSession.id}`);
    // Broadcast deletion to large screen (via WebSocket)
    this.socketServer?.to(message.gameSession.id).emit('wall_message_deleted', {
      id: message.id,
      gameSessionId: message.gameSession.id,
    });
    return { message: 'Message deleted successfully' };
  }

  async toggleTopWallMessage(messageId: string, hostId: string, isTop: boolean) {
    const message = await this.wallMessageRepository.findOne({ where: { id: messageId }, relations: ['gameSession'] });
    if (!message) {
      throw new NotFoundException('Wall message not found');
    }
    const hostUser = await this.userRepository.findOne({ where: { id: hostId } });
    if (!hostUser || message.gameSession.host.id !== hostId) {
      throw new ForbiddenException('Only the session host can toggle top status');
    }

    message.isTop = isTop;
    await this.wallMessageRepository.save(message);

    this.logger.log(`Wall message (${message.id}) top status toggled to ${isTop} by host ${hostId}`);
    // Broadcast update to large screen (via WebSocket)
    this.socketServer?.to(message.gameSession.id).emit('wall_message_updated', {
      id: message.id,
      gameSessionId: message.gameSession.id,
      updates: { isTop: message.isTop },
    });
    return message;
  }
}
