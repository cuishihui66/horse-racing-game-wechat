// backend/src/game/game.service.ts
import { Injectable, Logger, OnModuleDestroy, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameSession, GameSessionStatus } from './entities/game-session.entity';
import { Participant } from './entities/participant.entity';
import { User } from '../auth/entities/user.entity';
import { RedisService } from '@nestjs-modules/ioredis';
import { nanoid } from 'nanoid'; // yarn add nanoid or npm install nanoid
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io'; // Import Server for typing
import { WallMessage } from '../wall/entities/wall-message.entity'; // Import WallMessage for TypeOrmModule

@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private gameLoopIntervals: Map<string, NodeJS.Timeout> = new Map(); // Store interval per session
  private socketServer: Server; // Reference to the Socket.IO server

  private readonly GAME_UPDATE_INTERVAL_MS = 50; // 20 updates per second
  private readonly TRACK_LENGTH = 1000; // Finish line position (arbitrary units)
  private readonly HORSE_IMAGES = [ // Example horse images - replace with actual assets
    '/assets/horses/horse_1.png',
    '/assets/horses/horse_2.png',
    '/assets/horses/horse_3.png',
    '/assets/horses/horse_4.png',
    '/assets/horses/horse_5.png',
  ];

  constructor(
    @InjectRepository(GameSession)
    private gameSessionRepository: Repository<GameSession>,
    @InjectRepository(Participant)
    private participantRepository: Repository<Participant>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Set the Socket.IO server instance. This is needed for GameService to broadcast events.
   * Called by GameGateway after initialization.
   */
  setSocketServer(server: Server) {
    this.socketServer = server;
  }

  // --- Game Session Management (Host API via REST Controller) ---

  async createGameSession(hostId: string) {
    const host = await this.userRepository.findOne({ where: { id: hostId } });
    if (!host) {
      throw new NotFoundException('Host user not found');
    }

    const gameSession = this.gameSessionRepository.create({
      host,
      status: GameSessionStatus.WAITING,
    });
    await this.gameSessionRepository.save(gameSession);

    // Generate QR code URL
    const miniprogramBaseUrl = this.configService.get<string>('miniprogramUrl');
    const qrCodeUrl = `${miniprogramBaseUrl}${gameSession.id}`;
    gameSession.qrCodeUrl = qrCodeUrl;
    await this.gameSessionRepository.save(gameSession);

    // Store initial game state in Redis
    await this.redisService.hset(`game_state:${gameSession.id}`,
      'status', GameSessionStatus.WAITING,
      'qrScanEndTime', '0',
      'hostSocketId', '', // To be set when host connects via WS
      'trackLength', this.TRACK_LENGTH.toString(),
      'startTime', '0',
      'endTime', '0'
    );

    this.logger.log(`Game session created: ${gameSession.id} by host ${hostId}`);
    return { gameSessionId: gameSession.id, qrCodeUrl };
  }

  async startGameScanPhase(gameSessionId: string, durationSeconds: number) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (!gameSession) {
      throw new NotFoundException('Game session not found');
    }
    if (gameSession.status !== GameSessionStatus.WAITING && gameSession.status !== GameSessionStatus.READY_TO_START) {
      throw new BadRequestException('Game is not in waiting or ready_to_start status to start QR scan');
    }

    const qrScanEndTime = Date.now() + durationSeconds * 1000;
    await this.redisService.hset(`game_state:${gameSession.id}`,
      'status', GameSessionStatus.QR_SCANNING,
      'qrScanEndTime', qrScanEndTime.toString()
    );
    gameSession.status = GameSessionStatus.QR_SCANNING;
    await this.gameSessionRepository.save(gameSession);

    // Notify large screen clients
    this.socketServer?.to(gameSessionId).emit('qr_scan_started', {
      sessionId: gameSessionId,
      qrScanEndTime,
      status: GameSessionStatus.QR_SCANNING
    });
    this.logger.log(`Game session ${gameSessionId} QR scan phase started, ends at ${new Date(qrScanEndTime).toISOString()}`);

    // Schedule auto-end of QR scan phase
    setTimeout(() => this.endGameScanPhase(gameSessionId), durationSeconds * 1000);
    return { status: GameSessionStatus.QR_SCANNING, qrScanEndTime };
  }

  async endGameScanPhase(gameSessionId: string) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (!gameSession) {
      this.logger.warn(`Game session ${gameSessionId} not found during end scan phase.`);
      return;
    }

    const currentStatus = await this.redisService.hget(`game_state:${gameSession.id}`, 'status') as GameSessionStatus;

    if (currentStatus === GameSessionStatus.QR_SCANNING) {
      await this.redisService.hset(`game_state:${gameSession.id}`, 'status', GameSessionStatus.READY_TO_START);
      gameSession.status = GameSessionStatus.READY_TO_START;
      await this.gameSessionRepository.save(gameSession);

      this.socketServer?.to(gameSessionId).emit('qr_scan_ended', {
        sessionId: gameSessionId,
        status: GameSessionStatus.READY_TO_START
      });
      this.logger.log(`Game session ${gameSessionId} QR scan phase ended.`);
    }
  }

  async startGame(gameSessionId: string) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (!gameSession) {
      throw new NotFoundException('Game session not found');
    }

    const currentStatus = await this.redisService.hget(`game_state:${gameSession.id}`, 'status') as GameSessionStatus;
    if (currentStatus !== GameSessionStatus.READY_TO_START) {
      throw new BadRequestException('Game is not in ready_to_start status. Ensure QR scan is finished and participants have joined.');
    }

    // Check if there are participants
    const participantCount = await this.redisService.hlen(`game_participants:${gameSession.id}`);
    if (participantCount === 0) {
      throw new BadRequestException('Cannot start game without participants.');
    }

    await this.redisService.hset(`game_state:${gameSession.id}`,
      'status', GameSessionStatus.PLAYING,
      'startTime', Date.now().toString()
    );
    gameSession.status = GameSessionStatus.PLAYING;
    gameSession.startTime = new Date();
    await this.gameSessionRepository.save(gameSession);

    // Start game loop for this session
    if (!this.gameLoopIntervals.has(gameSessionId)) {
      const interval = setInterval(() => this.gameLoop(gameSessionId), this.GAME_UPDATE_INTERVAL_MS);
      this.gameLoopIntervals.set(gameSessionId, interval);
      this.logger.log(`Game loop started for session ${gameSessionId}`);
    } else {
      this.logger.warn(`Game loop for session ${gameSessionId} was already running.`);
    }

    this.socketServer?.to(gameSessionId).emit('game_started', {
      sessionId: gameSessionId,
      status: GameSessionStatus.PLAYING,
      startTime: gameSession.startTime.toISOString()
    });
    this.logger.log(`Game session ${gameSessionId} started.`);
    return { status: GameSessionStatus.PLAYING };
  }

  async resetGame(gameSessionId: string) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (!gameSession) {
      throw new NotFoundException('Game session not found');
    }

    // Stop game loop if running
    if (this.gameLoopIntervals.has(gameSessionId)) {
      clearInterval(this.gameLoopIntervals.get(gameSessionId));
      this.gameLoopIntervals.delete(gameSessionId);
      this.logger.log(`Game loop stopped for session ${gameSessionId}`);
    }

    // Reset Redis state for participants
    const participantKeys = await this.redisService.hkeys(`game_participants:${gameSession.id}`);
    for (const userId of participantKeys) {
      const participantData = JSON.parse(await this.redisService.hget(`game_participants:${gameSession.id}`, userId));
      await this.redisService.hset(`game_participants:${gameSession.id}`, userId, JSON.stringify({
        ...participantData, // Keep static info like nickname, horse image
        position: 0,
        speed: 0,
        lastTapTime: 0,
        tapCount: 0,
        finishTime: 0,
      }));
    }
    await this.redisService.del(`game_ranking:${gameSession.id}`); // Clear rankings

    await this.redisService.hset(`game_state:${gameSession.id}`,
      'status', GameSessionStatus.WAITING,
      'startTime', '0',
      'endTime', '0',
      'qrScanEndTime', '0'
    );
    gameSession.status = GameSessionStatus.WAITING;
    gameSession.startTime = null;
    gameSession.endTime = null;
    await this.gameSessionRepository.save(gameSession);

    // Also reset final ranks in PostgreSQL
    await this.participantRepository.update({ gameSession: { id: gameSessionId } }, { finalRank: null });


    this.socketServer?.to(gameSessionId).emit('game_reset', { sessionId: gameSessionId, status: GameSessionStatus.WAITING });
    this.logger.log(`Game session ${gameSessionId} reset.`);
    return { status: GameSessionStatus.WAITING };
  }

  async getGameSessionState(gameSessionId: string) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId }, relations: ['host'] });
    if (!gameSession) {
      throw new NotFoundException('Game session not found');
    }
    const redisGameState = await this.redisService.hgetall(`game_state:${gameSessionId}`);
    const participantsData = await this.redisService.hgetall(`game_participants:${gameSessionId}`);
    const participantsList = Object.entries(participantsData).map(([userId, data]) => ({ userId, ...JSON.parse(data) }));

    const currentRankings = await this.getRealtimeRankings(gameSessionId);

    return {
      ...gameSession,
      redisState: redisGameState,
      participants: participantsList,
      currentRankings,
    };
  }

  // --- Game Participation (Mini-Program API via REST Controller) ---
  async joinGame(gameSessionId: string, userId: string, wechatNickname: string, avatarUrl?: string) {
    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (!gameSession) {
      throw new NotFoundException('Game session not found');
    }

    const currentStatus = await this.redisService.hget(`game_state:${gameSessionId}`, 'status') as GameSessionStatus;
    if (currentStatus !== GameSessionStatus.WAITING && currentStatus !== GameSessionStatus.QR_SCANNING) {
      throw new BadRequestException('Game is not open for joining.');
    }

    let user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
        user = this.userRepository.create({ id: userId, wechatOpenid: nanoid(), wechatNickname, avatarUrl }); // Mock openid if needed, or use actual
        await this.userRepository.save(user);
    } else {
        // Update nickname/avatar if provided
        user.wechatNickname = wechatNickname || user.wechatNickname;
        user.avatarUrl = avatarUrl || user.avatarUrl;
        await this.userRepository.save(user);
    }

    let participant = await this.participantRepository.findOne({
      where: { gameSession: { id: gameSessionId }, user: { id: userId } }
    });

    if (!participant) {
      const assignedHorseIndex = await this.redisService.scard(`assigned_horses:${gameSessionId}`) % this.HORSE_IMAGES.length;
      const horseImageUrl = this.HORSE_IMAGES[assignedHorseIndex];

      participant = this.participantRepository.create({ gameSession, user, horseImageUrl });
      await this.participantRepository.save(participant);

      // Add to Redis game participants hash
      await this.redisService.hset(`game_participants:${gameSession.id}`, userId, JSON.stringify({
        wechatNickname: user.wechatNickname,
        horseImageUrl,
        position: 0,
        speed: 0,
        lastTapTime: 0,
        tapCount: 0,
        finishTime: 0,
        isFinished: false,
      }));

      this.socketServer?.to(gameSessionId).emit('participant_joined', {
        sessionId: gameSessionId,
        userId: user.id,
        wechatNickname: user.wechatNickname,
        horseImageUrl,
        initialPosition: 0,
      });
      this.logger.log(`User ${user.id} joined session ${gameSessionId}`);
    } else {
        this.logger.log(`User ${user.id} re-joined session ${gameSessionId}`);
    }

    return {
      participantId: participant.id,
      horseImageUrl: participant.horseImageUrl,
      gameSessionStatus: currentStatus,
    };
  }

  // --- Real-time Game Logic (Game Loop) ---
  private async gameLoop(gameSessionId: string) {
    try {
      const gameState = await this.redisService.hgetall(`game_state:${gameSessionId}`);
      if (gameState.status !== GameSessionStatus.PLAYING) {
        this.logger.warn(`Game loop running for session ${gameSessionId} but status is ${gameState.status}. Stopping loop.`);
        clearInterval(this.gameLoopIntervals.get(gameSessionId));
        this.gameLoopIntervals.delete(gameSessionId);
        return;
      }

      const participantsData = await this.redisService.hgetall(`game_participants:${gameSessionId}`);
      const trackLength = parseInt(gameState.trackLength, 10);
      const now = Date.now();
      const updates: { userId: string; position: number; speed: number; }[] = [];
      let raceFinishedBySomeone = false;

      // Filter out participants who have already finished
      const activeParticipants = Object.entries(participantsData).filter(([, data]) => {
          const p = JSON.parse(data as string);
          return !p.isFinished;
      });

      for (const [userId, rawParticipantData] of activeParticipants) {
        const participant = JSON.parse(rawParticipantData as string);

        // Decay speed if no recent taps
        const timeSinceLastTap = now - participant.lastTapTime;
        if (timeSinceLastTap > 200) { // If no tap for 200ms
          participant.speed = Math.max(0, participant.speed * 0.95 - 0.1); // Gradual decay
        }

        // Update position
        participant.position += participant.speed * (this.GAME_UPDATE_INTERVAL_MS / 1000); // Speed is units per second (pixels/s)
        participant.position = Math.min(participant.position, trackLength);

        if (participant.position >= trackLength && !participant.isFinished) {
          participant.finishTime = now; // Record finish time
          participant.isFinished = true;
          await this.redisService.zadd(`game_ranking:${gameSessionId}`, participant.finishTime, userId);
          raceFinishedBySomeone = true;
          this.logger.log(`Participant ${participant.wechatNickname} finished race in session ${gameSessionId}`);
        }
        updates.push({ userId, position: participant.position, speed: participant.speed });
        await this.redisService.hset(`game_participants:${gameSessionId}`, userId, JSON.stringify(participant));
      }

      if (updates.length > 0) {
        // Broadcast updates to large screen and mini-program clients
        this.socketServer?.to(gameSessionId).emit('horse_position_update', {
          sessionId: gameSessionId,
          updates,
          timestamp: now,
          // Maybe include current top N rankings here directly for client
          currentTopRankings: await this.getRealtimeRankings(gameSessionId),
        });
      }


      // Check if all participants finished, or if raceFinishedBySomeone should end the game
      // Current logic: game ends when the first horse crosses
      if (raceFinishedBySomeone) {
        await this.endGame(gameSessionId);
      }
    } catch (error) {
      this.logger.error(`Error in game loop for session ${gameSessionId}:`, error.stack);
      // Attempt to stop the loop to prevent repeated errors
      if (this.gameLoopIntervals.has(gameSessionId)) {
        clearInterval(this.gameLoopIntervals.get(gameSessionId));
        this.gameLoopIntervals.delete(gameSessionId);
      }
    }
  }

  async handleAccelerate(gameSessionId: string, userId: string) {
    const gameState = await this.redisService.hgetall(`game_state:${gameSessionId}`);
    if (gameState.status !== GameSessionStatus.PLAYING) {
      this.logger.warn(`Acceleration for session ${gameSessionId} not allowed, status: ${gameState.status}`);
      return;
    }

    const participantData = await this.redisService.hget(`game_participants:${gameSessionId}`, userId);
    if (!participantData) {
      this.logger.warn(`Participant ${userId} not found in session ${gameSessionId}`);
      return;
    }

    const participant = JSON.parse(participantData);
    if (participant.isFinished) {
      this.logger.log(`Participant ${participant.wechatNickname} already finished. Ignoring accelerate event.`);
      return;
    }

    // Increase speed and update last tap time
    participant.speed = Math.min(participant.speed + 5, 200); // Cap max speed (arbitrary units/s)
    participant.lastTapTime = Date.now();
    participant.tapCount++;

    await this.redisService.hset(`game_participants:${gameSessionId}`, userId, JSON.stringify(participant));
    // Optionally emit individual feedback to mini-program
    this.socketServer?.to(this.getUserSocketId(userId, gameSessionId)).emit('your_speed_update', { speed: participant.speed, currentPosition: participant.position });
  }

  async endGame(gameSessionId: string) {
    // Stop game loop
    if (this.gameLoopIntervals.has(gameSessionId)) {
      clearInterval(this.gameLoopIntervals.get(gameSessionId));
      this.gameLoopIntervals.delete(gameSessionId);
      this.logger.log(`Game loop stopped for session ${gameSessionId}`);
    }

    await this.redisService.hset(`game_state:${gameSessionId}`,
      'status', GameSessionStatus.FINISHED,
      'endTime', Date.now().toString()
    );

    const gameSession = await this.gameSessionRepository.findOne({ where: { id: gameSessionId } });
    if (gameSession) {
      gameSession.status = GameSessionStatus.FINISHED;
      gameSession.endTime = new Date();
      await this.gameSessionRepository.save(gameSession);
    } else {
      this.logger.error(`GameSession ${gameSessionId} not found in DB during endGame.`);
    }


    // Get final rankings from Redis Sorted Set
    const rawRankings = await this.redisService.zrange(`game_ranking:${gameSessionId}`, 0, -1, 'WITHSCORES');
    const finalRankings: any[] = [];
    for (let i = 0; i < rawRankings.length; i += 2) {
        const userId = rawRankings[i];
        const finishTime = parseInt(rawRankings[i+1], 10); // score is finishTime
        const participantData = JSON.parse(await this.redisService.hget(`game_participants:${gameSessionId}`, userId));

        finalRankings.push({
            userId,
            wechatNickname: participantData.wechatNickname,
            horseImageUrl: participantData.horseImageUrl,
            finishTime,
            rank: (i / 2) + 1,
        });
        // Update participant entity in PostgreSQL with final rank
        await this.participantRepository.update(
          { gameSession: { id: gameSessionId }, user: { id: userId } },
          { finalRank: (i / 2) + 1 }
        );
    }

    this.socketServer?.to(gameSessionId).emit('game_finished', {
      sessionId: gameSessionId,
      status: GameSessionStatus.FINISHED,
      finalRankings
    });
    this.logger.log(`Game session ${gameSessionId} finished. Rankings:`, finalRankings);
  }

  // --- Utility methods ---
  async getRealtimeRankings(gameSessionId: string, limit: number = 3) {
    const rawRankings = await this.redisService.zrange(`game_ranking:${gameSessionId}`, 0, limit - 1, 'WITHSCORES');
    const rankings = [];
    for (let i = 0; i < rawRankings.length; i += 2) {
        const userId = rawRankings[i];
        const score = parseInt(rawRankings[i+1], 10);
        const participantData = JSON.parse(await this.redisService.hget(`game_participants:${gameSessionId}`, userId));
        rankings.push({
            userId,
            wechatNickname: participantData.wechatNickname,
            rank: (i / 2) + 1,
            score: score, // Could be finishTime or current position in a live game
        });
    }

    // If game is playing, sort by current position (higher position = better rank)
    const gameState = await this.redisService.hgetall(`game_state:${gameSessionId}`);
    if (gameState.status === GameSessionStatus.PLAYING) {
        const allParticipantsData = await this.redisService.hgetall(`game_participants:${gameSessionId}`);
        const allParticipants = Object.entries(allParticipantsData).map(([userId, data]) => ({ userId, ...JSON.parse(data) }));
        allParticipants.sort((a, b) => b.position - a.position); // Descending order of position
        return allParticipants.slice(0, limit).map((p, index) => ({
            userId: p.userId,
            wechatNickname: p.wechatNickname,
            rank: index + 1,
            position: p.position,
        }));
    }

    return rankings;
  }

  async getParticipantState(gameSessionId: string, userId: string) {
    const participantData = await this.redisService.hget(`game_participants:${gameSessionId}`, userId);
    if (!participantData) {
      throw new NotFoundException(`Participant ${userId} not found in session ${gameSessionId}`);
    }
    return JSON.parse(participantData);
  }

  // Helper to find a specific user's socket ID in a session (if needed for direct messaging)
  private getUserSocketId(userId: string, sessionId: string): string {
    // This is a simplified approach. In a real app, you'd store userId -> socketId mapping in Redis
    // and fetch all sockets in the room for a user.
    // For now, this assumes one socket per user per session.
    // This would ideally be managed by the GameGateway and stored in Redis.
    return `${userId}-${sessionId}`; // Placeholder, needs actual implementation in Gateway
  }


  onModuleDestroy() {
    this.gameLoopIntervals.forEach(interval => clearInterval(interval));
    this.gameLoopIntervals.clear();
    this.logger.log('GameService destroyed, all game loops cleared.');
  }
}
