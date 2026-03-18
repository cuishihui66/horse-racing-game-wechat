import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { GameSession, GameSessionStatus } from './entities/game-session.entity';
import { Participant } from './entities/participant.entity';
import { User } from '../auth/entities/user.entity';

type RuntimeState = {
  status: GameSessionStatus;
  trackLength: number;
  stepDistance: number;
  countdownEndsAt: number | null;
  finishLimit: number;
  finishedCount: number;
  totalTapCount: number;
};

type ParticipantState = {
  participantId: string;
  userId: string;
  wechatNickname: string;
  avatarUrl: string;
  horseStyle: string;
  horseColor: string;
  horseAccentColor: string;
  horseBadge: string;
  laneNumber: number;
  position: number;
  tapCount: number;
  finishTime: number | null;
  finalRank: number | null;
  isFinished: boolean;
  joinedAt: string;
  isBot: boolean;
};

@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private socketServer?: Server;
  private readonly countdownTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly simulationIntervals = new Map<string, NodeJS.Timeout>();
  private readonly simulationLocks = new Set<string>();

  private readonly TRACK_LENGTH = 100;
  private readonly STEP_DISTANCE = 4;
  private readonly DEFAULT_COUNTDOWN_SECONDS = 3;
  private readonly DEFAULT_TITLE = 'Horse Racing Shake';
  private readonly BOT_TICK_INTERVAL_MS = 260;
  private readonly BOT_PREFIXES = ['Spark', 'Nova', 'Dash', 'Pixel', 'Rocket', 'Cocoa', 'Luna', 'Mango'];
  private readonly BOT_SUFFIXES = ['Rider', 'Pony', 'Sprinter', 'Blink', 'Breeze', 'Flash', 'Comet', 'Wave'];
  private readonly HORSE_PALETTES = [
    { style: 'sunburst', color: '#ff7a59', accentColor: '#ffd166', badge: 'A' },
    { style: 'mint', color: '#25c2a0', accentColor: '#d9fff5', badge: 'B' },
    { style: 'violet', color: '#7f5cff', accentColor: '#f5d0fe', badge: 'C' },
    { style: 'skyline', color: '#2bb3ff', accentColor: '#e0f2fe', badge: 'D' },
    { style: 'berry', color: '#ff4f8b', accentColor: '#fee2e2', badge: 'E' },
    { style: 'amber', color: '#ffb703', accentColor: '#fff1bf', badge: 'F' },
    { style: 'jade', color: '#22c55e', accentColor: '#dcfce7', badge: 'G' },
    { style: 'storm', color: '#475569', accentColor: '#cbd5e1', badge: 'H' },
  ];

  constructor(
    @InjectRepository(GameSession)
    private readonly gameSessionRepository: Repository<GameSession>,
    @InjectRepository(Participant)
    private readonly participantRepository: Repository<Participant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRedis()
    private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  setSocketServer(server: Server) {
    this.socketServer = server;
  }

  private getGameStateRedisKey(sessionId: string) {
    return `game:${sessionId}:state`;
  }

  private getParticipantRedisKey(sessionId: string) {
    return `game:${sessionId}:participants`;
  }

  private buildQrImageUrl(text?: string | null) {
    if (!text) {
      return '';
    }

    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(text)}`;
  }

  private sanitizeTitle(title?: string | null) {
    const nextTitle = `${title || ''}`.trim();
    return nextTitle || this.DEFAULT_TITLE;
  }

  private clampWallOpacity(value: number) {
    if (Number.isNaN(Number(value))) {
      return 0.72;
    }

    return Math.min(1, Math.max(0.15, Number(value)));
  }

  private getPalette(index: number) {
    return this.HORSE_PALETTES[index % this.HORSE_PALETTES.length];
  }

  private ensureDevMode() {
    if (!this.configService.get<boolean>('devAuthMode')) {
      throw new ForbiddenException('Dev mode is disabled');
    }
  }

  private isBotOpenid(openid?: string | null) {
    return Boolean(openid && openid.startsWith('dev-bot-'));
  }

  private createBotProfile(seed: number) {
    const prefix = this.BOT_PREFIXES[seed % this.BOT_PREFIXES.length];
    const suffix = this.BOT_SUFFIXES[(seed * 3) % this.BOT_SUFFIXES.length];
    const nickname = `${prefix} ${suffix}`;
    const openid = `dev-bot-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`;
    const avatarLabel = encodeURIComponent(prefix.slice(0, 2).toUpperCase());

    return {
      openid,
      nickname,
      avatarUrl: `https://via.placeholder.com/96/15243f/f3f8ff?text=${avatarLabel}`,
    };
  }

  private serializeParticipantState(state: ParticipantState) {
    return {
      ...state,
      progressPercent: Math.round((state.position / this.TRACK_LENGTH) * 1000) / 10,
    };
  }

  private serializePublicRanking(participant: ParticipantState, fallbackRank: number) {
    return {
      userId: participant.userId,
      participantId: participant.participantId,
      wechatNickname: participant.wechatNickname,
      avatarUrl: participant.avatarUrl || '',
      horseStyle: participant.horseStyle,
      horseColor: participant.horseColor,
      horseAccentColor: participant.horseAccentColor,
      horseBadge: participant.horseBadge,
      laneNumber: participant.laneNumber,
      position: participant.position,
      tapCount: participant.tapCount,
      finalRank: participant.finalRank,
      rank: participant.finalRank || fallbackRank,
      isFinished: participant.isFinished,
      finishTime: participant.finishTime,
      isBot: participant.isBot,
      progressPercent: Math.round((participant.position / this.TRACK_LENGTH) * 1000) / 10,
    };
  }

  private async getSessionOrThrow(sessionId: string, relations: string[] = ['host']) {
    const session = await this.gameSessionRepository.findOne({
      where: { id: sessionId },
      relations,
    });

    if (!session) {
      throw new NotFoundException('Game session not found');
    }

    return session;
  }

  private async assertHostOwnsSession(
    sessionId: string,
    hostId: string,
    relations: string[] = ['host'],
  ) {
    const session = await this.getSessionOrThrow(sessionId, relations);

    if (session.host.id !== hostId) {
      throw new ForbiddenException('Only the host can manage this session');
    }

    return session;
  }

  private async ensureRuntimeState(session: GameSession): Promise<RuntimeState> {
    const key = this.getGameStateRedisKey(session.id);
    const existing = await this.redis.hgetall(key);

    if (existing.status) {
      return {
        status: (existing.status as GameSessionStatus) || session.status,
        trackLength: Number(existing.trackLength || this.TRACK_LENGTH),
        stepDistance: Number(existing.stepDistance || this.STEP_DISTANCE),
        countdownEndsAt: existing.countdownEndsAt ? Number(existing.countdownEndsAt) : null,
        finishLimit: Number(existing.finishLimit || 0),
        finishedCount: Number(existing.finishedCount || 0),
        totalTapCount: Number(existing.totalTapCount || 0),
      };
    }

    const seed: RuntimeState = {
      status: session.status,
      trackLength: this.TRACK_LENGTH,
      stepDistance: this.STEP_DISTANCE,
      countdownEndsAt: null,
      finishLimit: 0,
      finishedCount: 0,
      totalTapCount: 0,
    };

    await this.redis.hset(key, {
      status: seed.status,
      trackLength: String(seed.trackLength),
      stepDistance: String(seed.stepDistance),
      countdownEndsAt: '',
      finishLimit: '0',
      finishedCount: '0',
      totalTapCount: '0',
    });

    return seed;
  }

  private async persistRuntimeState(sessionId: string, state: Partial<RuntimeState>) {
    const payload: Record<string, string> = {};

    if (state.status) {
      payload.status = state.status;
    }
    if (state.trackLength !== undefined) {
      payload.trackLength = String(state.trackLength);
    }
    if (state.stepDistance !== undefined) {
      payload.stepDistance = String(state.stepDistance);
    }
    if (state.finishLimit !== undefined) {
      payload.finishLimit = String(state.finishLimit);
    }
    if (state.finishedCount !== undefined) {
      payload.finishedCount = String(state.finishedCount);
    }
    if (state.totalTapCount !== undefined) {
      payload.totalTapCount = String(state.totalTapCount);
    }
    if (state.countdownEndsAt !== undefined) {
      payload.countdownEndsAt = state.countdownEndsAt ? String(state.countdownEndsAt) : '';
    }

    if (Object.keys(payload).length > 0) {
      await this.redis.hset(this.getGameStateRedisKey(sessionId), payload);
    }
  }

  private async getParticipantsState(sessionId: string): Promise<ParticipantState[]> {
    const rawStates = await this.redis.hgetall(this.getParticipantRedisKey(sessionId));

    if (Object.keys(rawStates).length > 0) {
      return Object.values(rawStates)
        .map((rawValue) => JSON.parse(rawValue) as ParticipantState)
        .sort((left, right) => left.laneNumber - right.laneNumber);
    }

    const participants = await this.participantRepository.find({
      where: { gameSession: { id: sessionId } },
      relations: ['user'],
      order: { laneNumber: 'ASC', joinedAt: 'ASC' },
    });

    if (participants.length === 0) {
      return [];
    }

    const rebuilt: ParticipantState[] = participants.map((participant, index) => {
      const palette = this.getPalette(index);
      const isBot = this.isBotOpenid(participant.user?.wechatOpenid);

      return {
        participantId: participant.id,
        userId: participant.user.id,
        wechatNickname: participant.user.wechatNickname || `User ${participant.user.id.slice(0, 4)}`,
        avatarUrl: participant.user.avatarUrl || '',
        horseStyle: participant.horseStyle || palette.style,
        horseColor: participant.horseColor || palette.color,
        horseAccentColor: participant.horseAccentColor || palette.accentColor,
        horseBadge: palette.badge,
        laneNumber: participant.laneNumber || index + 1,
        position: participant.finalRank ? this.TRACK_LENGTH : 0,
        tapCount: 0,
        finishTime: null,
        finalRank: participant.finalRank ?? null,
        isFinished: Boolean(participant.finalRank),
        joinedAt: participant.joinedAt.toISOString(),
        isBot,
      };
    });

    const redisPayload: Record<string, string> = {};
    rebuilt.forEach((participant) => {
      redisPayload[participant.userId] = JSON.stringify(participant);
    });

    await this.redis.hset(this.getParticipantRedisKey(sessionId), redisPayload);
    return rebuilt;
  }

  private async saveParticipantState(sessionId: string, participant: ParticipantState) {
    await this.redis.hset(
      this.getParticipantRedisKey(sessionId),
      participant.userId,
      JSON.stringify(participant),
    );
  }

  private async clearCountdownTimer(sessionId: string) {
    const timeout = this.countdownTimeouts.get(sessionId);

    if (timeout) {
      clearTimeout(timeout);
      this.countdownTimeouts.delete(sessionId);
    }
  }

  private stopSimulationLoop(sessionId: string) {
    const interval = this.simulationIntervals.get(sessionId);

    if (interval) {
      clearInterval(interval);
      this.simulationIntervals.delete(sessionId);
    }

    this.simulationLocks.delete(sessionId);
  }

  private emitToDisplay(eventName: string, payload: unknown) {
    this.socketServer?.to('display-global').emit(eventName, payload);
  }

  private async broadcastSessionState(sessionId: string, eventName = 'game_state_update') {
    const state = await this.getGameSessionState(sessionId);
    this.socketServer?.to(sessionId).emit(eventName, state);
    this.emitToDisplay(eventName, state);
    return state;
  }

  private async runSimulationTick(sessionId: string) {
    if (this.simulationLocks.has(sessionId)) {
      return;
    }

    this.simulationLocks.add(sessionId);

    try {
      const session = await this.getSessionOrThrow(sessionId, ['host']);
      const runtimeState = await this.ensureRuntimeState(session);

      if (
        runtimeState.status === GameSessionStatus.FINISHED ||
        runtimeState.status === GameSessionStatus.QR_SCANNING
      ) {
        return;
      }

      if (runtimeState.status !== GameSessionStatus.PLAYING) {
        return;
      }

      const participants = await this.getParticipantsState(sessionId);
      const activeBots = participants.filter((participant) => participant.isBot && !participant.isFinished);

      if (activeBots.length === 0) {
        this.stopSimulationLoop(sessionId);
        return;
      }

      for (const participant of activeBots) {
        const boostChance = 0.35 + ((participant.laneNumber % 4) * 0.12);
        if (Math.random() > boostChance) {
          continue;
        }

        const burst = Math.random() > 0.72 ? 2 : 1;
        for (let index = 0; index < burst; index += 1) {
          await this.handleAccelerate(sessionId, participant.userId);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Bot simulation tick failed for ${sessionId}: ${message}`, stack);
    } finally {
      this.simulationLocks.delete(sessionId);
    }
  }

  async getCurrentDisplaySessionState() {
    const [session] = await this.gameSessionRepository.find({
      order: { updatedAt: 'DESC' },
      relations: ['host'],
      take: 1,
    });

    if (!session) {
      return null;
    }

    return this.getGameSessionState(session.id);
  }

  async createGameSession(hostId: string, title?: string) {
    const host = await this.userRepository.findOne({ where: { id: hostId } });

    if (!host) {
      throw new NotFoundException('Host user not found');
    }

    const session = this.gameSessionRepository.create({
      host,
      title: this.sanitizeTitle(title),
      status: GameSessionStatus.QR_SCANNING,
      wallOpacity: 0.72,
      countdownSeconds: this.DEFAULT_COUNTDOWN_SECONDS,
    });

    await this.gameSessionRepository.save(session);
    session.qrCodeUrl = `${this.configService.get<string>('miniprogramUrl')}${session.id}`;
    session.wallQrCodeUrl = `${this.configService.get<string>('wallMiniprogramUrl')}${session.id}`;
    await this.gameSessionRepository.save(session);

    await this.persistRuntimeState(session.id, {
      status: GameSessionStatus.QR_SCANNING,
      trackLength: this.TRACK_LENGTH,
      stepDistance: this.STEP_DISTANCE,
      countdownEndsAt: null,
      finishLimit: 0,
      finishedCount: 0,
      totalTapCount: 0,
    });

    this.logger.log(`Game session created: ${session.id}`);
    return this.broadcastSessionState(session.id, 'game_state_init');
  }

  async listSessionsForHost(hostId: string) {
    const sessions = await this.gameSessionRepository.find({
      where: { host: { id: hostId } },
      relations: ['participants', 'participants.user'],
      order: { createdAt: 'DESC' },
    });

    return sessions.map((session) => {
      const podium = (session.participants || [])
        .filter((participant) => participant.finalRank && participant.finalRank <= 3)
        .sort((left, right) => (left.finalRank || 999) - (right.finalRank || 999))
        .map((participant) => ({
          rank: participant.finalRank,
          userId: participant.user.id,
          wechatNickname: participant.user.wechatNickname || `User ${participant.user.id.slice(0, 4)}`,
          avatarUrl: participant.user.avatarUrl || '',
        }));

      return {
        id: session.id,
        title: session.title,
        status: session.status,
        participantCount: session.participants?.length ?? 0,
        wallOpacity: session.wallOpacity,
        qrCodeUrl: session.qrCodeUrl,
        wallQrCodeUrl: session.wallQrCodeUrl,
        qrCodeImageUrl: this.buildQrImageUrl(session.qrCodeUrl),
        wallQrCodeImageUrl: this.buildQrImageUrl(session.wallQrCodeUrl),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        endTime: session.endTime,
        podium,
      };
    });
  }

  async startGameScanPhase(sessionId: string, hostId: string) {
    const session = await this.assertHostOwnsSession(sessionId, hostId, ['host']);
    await this.clearCountdownTimer(sessionId);
    this.stopSimulationLoop(sessionId);

    session.status = GameSessionStatus.QR_SCANNING;
    await this.gameSessionRepository.save(session);

    await this.persistRuntimeState(sessionId, {
      status: GameSessionStatus.QR_SCANNING,
      countdownEndsAt: null,
      finishedCount: 0,
    });

    this.socketServer?.to(sessionId).emit('qr_scan_started', {
      sessionId,
      status: GameSessionStatus.QR_SCANNING,
    });

    return this.broadcastSessionState(sessionId);
  }

  async prepareGame(sessionId: string, hostId: string) {
    const session = await this.assertHostOwnsSession(sessionId, hostId, ['host']);
    const participants = await this.getParticipantsState(sessionId);

    if (participants.length === 0) {
      throw new BadRequestException('At least one participant is required');
    }

    session.status = GameSessionStatus.READY_TO_START;
    await this.gameSessionRepository.save(session);

    await this.persistRuntimeState(sessionId, {
      status: GameSessionStatus.READY_TO_START,
      countdownEndsAt: null,
      finishLimit: Math.min(5, participants.length),
      finishedCount: participants.filter((participant) => participant.isFinished).length,
    });

    this.socketServer?.to(sessionId).emit('game_prepared', {
      sessionId,
      status: GameSessionStatus.READY_TO_START,
    });

    return this.broadcastSessionState(sessionId);
  }

  async endGameScanPhase(sessionId: string, hostId?: string) {
    if (!hostId) {
      const session = await this.getSessionOrThrow(sessionId, ['host']);
      return this.prepareGame(sessionId, session.host.id);
    }

    return this.prepareGame(sessionId, hostId);
  }

  async updateWallSettings(sessionId: string, hostId: string, wallOpacity: number) {
    const session = await this.assertHostOwnsSession(sessionId, hostId, ['host']);
    session.wallOpacity = this.clampWallOpacity(wallOpacity);
    await this.gameSessionRepository.save(session);
    return this.broadcastSessionState(sessionId);
  }

  async startGame(sessionId: string, hostId: string) {
    const session = await this.assertHostOwnsSession(sessionId, hostId, ['host']);
    const runtimeState = await this.ensureRuntimeState(session);
    const participants = await this.getParticipantsState(sessionId);

    if (runtimeState.status !== GameSessionStatus.READY_TO_START) {
      throw new BadRequestException('The session is not ready to start');
    }

    if (participants.length === 0) {
      throw new BadRequestException('No participants joined this session');
    }

    await this.clearCountdownTimer(sessionId);
    const countdownSeconds = session.countdownSeconds || this.DEFAULT_COUNTDOWN_SECONDS;
    const countdownEndsAt = Date.now() + countdownSeconds * 1000;

    session.status = GameSessionStatus.COUNTDOWN;
    await this.gameSessionRepository.save(session);

    await this.persistRuntimeState(sessionId, {
      status: GameSessionStatus.COUNTDOWN,
      countdownEndsAt,
      finishLimit: Math.min(5, participants.length),
      finishedCount: 0,
      totalTapCount: 0,
    });

    this.socketServer?.to(sessionId).emit('countdown_started', {
      sessionId,
      status: GameSessionStatus.COUNTDOWN,
      countdownSeconds,
      countdownEndsAt,
    });

    await this.broadcastSessionState(sessionId);

    this.countdownTimeouts.set(
      sessionId,
      setTimeout(() => {
        this.launchRace(sessionId).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;
          this.logger.error(`Countdown launch failed for ${sessionId}: ${message}`, stack);
        });
      }, countdownSeconds * 1000),
    );

    return {
      sessionId,
      status: GameSessionStatus.COUNTDOWN,
      countdownSeconds,
      countdownEndsAt,
    };
  }

  private async launchRace(sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId, ['host']);
    const runtimeState = await this.ensureRuntimeState(session);

    if (runtimeState.status !== GameSessionStatus.COUNTDOWN) {
      return;
    }

    await this.clearCountdownTimer(sessionId);
    session.status = GameSessionStatus.PLAYING;
    session.startTime = new Date();
    session.endTime = null;
    await this.gameSessionRepository.save(session);

    await this.persistRuntimeState(sessionId, {
      status: GameSessionStatus.PLAYING,
      countdownEndsAt: null,
    });

    this.socketServer?.to(sessionId).emit('game_started', {
      sessionId,
      status: GameSessionStatus.PLAYING,
      startTime: session.startTime.toISOString(),
    });

    await this.broadcastSessionState(sessionId);
  }

  async resetGame(sessionId: string, hostId: string) {
    const session = await this.assertHostOwnsSession(sessionId, hostId, ['host']);
    await this.clearCountdownTimer(sessionId);
    this.stopSimulationLoop(sessionId);

    const participants = await this.getParticipantsState(sessionId);
    for (const participant of participants) {
      participant.position = 0;
      participant.tapCount = 0;
      participant.finishTime = null;
      participant.finalRank = null;
      participant.isFinished = false;
      await this.saveParticipantState(sessionId, participant);
    }

    const allParticipants = await this.participantRepository.find({
      where: { gameSession: { id: sessionId } },
    });

    for (const participant of allParticipants) {
      participant.finalRank = null;
      await this.participantRepository.save(participant);
    }

    session.status = GameSessionStatus.QR_SCANNING;
    session.startTime = null;
    session.endTime = null;
    await this.gameSessionRepository.save(session);

    await this.persistRuntimeState(sessionId, {
      status: GameSessionStatus.QR_SCANNING,
      countdownEndsAt: null,
      finishedCount: 0,
      finishLimit: Math.min(5, participants.length),
      totalTapCount: 0,
    });

    this.socketServer?.to(sessionId).emit('game_reset', {
      sessionId,
      status: GameSessionStatus.QR_SCANNING,
    });

    return this.broadcastSessionState(sessionId);
  }

  async getGameSessionState(sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId, ['host', 'participants', 'participants.user']);
    const runtimeState = await this.ensureRuntimeState(session);
    const participants = await this.getParticipantsState(sessionId);
    const currentRankings = await this.getRealtimeRankings(sessionId, 5);
    const finalRankings =
      runtimeState.status === GameSessionStatus.FINISHED ? await this.getFinalRankings(sessionId) : [];

    return {
      id: session.id,
      title: session.title,
      status: runtimeState.status,
      startTime: session.startTime,
      endTime: session.endTime,
      qrCodeUrl: session.qrCodeUrl,
      wallQrCodeUrl: session.wallQrCodeUrl,
      qrCodeImageUrl: this.buildQrImageUrl(session.qrCodeUrl),
      wallQrCodeImageUrl: this.buildQrImageUrl(session.wallQrCodeUrl),
      participantCount: participants.length,
      wallOpacity: session.wallOpacity,
      countdownSeconds: session.countdownSeconds,
      countdownEndsAt: runtimeState.countdownEndsAt,
      trackLength: runtimeState.trackLength,
      stepDistance: runtimeState.stepDistance,
      finishLimit: runtimeState.finishLimit || Math.min(5, participants.length),
      finishedCount: runtimeState.finishedCount,
      totalTapCount: runtimeState.totalTapCount,
      simulationActive: this.simulationIntervals.has(sessionId),
      participants: participants.map((participant) => this.serializeParticipantState(participant)),
      currentRankings,
      finalRankings,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async joinGame(sessionId: string, userId: string, wechatNickname: string, avatarUrl?: string) {
    const session = await this.getSessionOrThrow(sessionId, ['host']);
    const runtimeState = await this.ensureRuntimeState(session);

    if (runtimeState.status !== GameSessionStatus.QR_SCANNING) {
      throw new BadRequestException('The session is not accepting joins');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.wechatNickname = wechatNickname || user.wechatNickname;
    user.avatarUrl = avatarUrl || user.avatarUrl;
    await this.userRepository.save(user);

    let participant = await this.participantRepository.findOne({
      where: { gameSession: { id: sessionId }, user: { id: userId } },
      relations: ['user'],
    });

    if (!participant) {
      const existingCount = await this.participantRepository.count({
        where: { gameSession: { id: sessionId } },
      });
      const palette = this.getPalette(existingCount);

      participant = this.participantRepository.create({
        gameSession: session,
        user,
        horseImageUrl: '',
        horseColor: palette.color,
        horseAccentColor: palette.accentColor,
        horseStyle: palette.style,
        laneNumber: existingCount + 1,
      });

      participant = await this.participantRepository.save(participant);
    }

    const palette = this.getPalette((participant.laneNumber || 1) - 1);
    const state: ParticipantState = {
      participantId: participant.id,
      userId: user.id,
      wechatNickname: user.wechatNickname || `User ${user.id.slice(0, 4)}`,
      avatarUrl: user.avatarUrl || '',
      horseStyle: participant.horseStyle || palette.style,
      horseColor: participant.horseColor || palette.color,
      horseAccentColor: participant.horseAccentColor || palette.accentColor,
      horseBadge: palette.badge,
      laneNumber: participant.laneNumber || 1,
      position: 0,
      tapCount: 0,
      finishTime: null,
      finalRank: null,
      isFinished: false,
      joinedAt: participant.joinedAt.toISOString(),
      isBot: this.isBotOpenid(user.wechatOpenid),
    };

    await this.saveParticipantState(sessionId, state);
    await this.persistRuntimeState(sessionId, {
      finishLimit: Math.min(5, (await this.getParticipantsState(sessionId)).length),
    });

    this.socketServer?.to(sessionId).emit('participant_joined', {
      sessionId,
      participant: this.serializeParticipantState(state),
    });

    await this.broadcastSessionState(sessionId);

    return {
      participantId: participant.id,
      gameSessionId: sessionId,
      gameSessionStatus: runtimeState.status,
      participant: this.serializeParticipantState(state),
    };
  }

  async createFakeParticipants(sessionId: string, hostId: string, count = 6) {
    this.ensureDevMode();
    await this.assertHostOwnsSession(sessionId, hostId, ['host']);

    const safeCount = Math.min(30, Math.max(1, Number(count) || 1));
    const createdParticipants = [];

    for (let index = 0; index < safeCount; index += 1) {
      const profile = this.createBotProfile(index);
      const user = this.userRepository.create({
        wechatOpenid: profile.openid,
        wechatNickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
      });

      const savedUser = await this.userRepository.save(user);
      const joined = await this.joinGame(sessionId, savedUser.id, profile.nickname, profile.avatarUrl);
      createdParticipants.push(joined.participant);
    }

    return {
      sessionId,
      createdCount: createdParticipants.length,
      participants: createdParticipants,
    };
  }

  async startBotSimulation(sessionId: string, hostId: string) {
    this.ensureDevMode();
    await this.assertHostOwnsSession(sessionId, hostId, ['host']);

    const participants = await this.getParticipantsState(sessionId);
    const botCount = participants.filter((participant) => participant.isBot).length;

    if (botCount === 0) {
      throw new BadRequestException('No fake users found in this session');
    }

    this.stopSimulationLoop(sessionId);
    const interval = setInterval(() => {
      void this.runSimulationTick(sessionId);
    }, this.BOT_TICK_INTERVAL_MS);
    this.simulationIntervals.set(sessionId, interval);

    return {
      sessionId,
      active: true,
      botCount,
      tickIntervalMs: this.BOT_TICK_INTERVAL_MS,
    };
  }

  async stopBotSimulation(sessionId: string, hostId: string) {
    this.ensureDevMode();
    await this.assertHostOwnsSession(sessionId, hostId, ['host']);
    this.stopSimulationLoop(sessionId);

    return {
      sessionId,
      active: false,
    };
  }

  async handleAccelerate(sessionId: string, userId: string) {
    const session = await this.getSessionOrThrow(sessionId, ['host']);
    const runtimeState = await this.ensureRuntimeState(session);

    if (runtimeState.status !== GameSessionStatus.PLAYING) {
      return { accepted: false, reason: 'GAME_NOT_PLAYING' };
    }

    const rawParticipant = await this.redis.hget(this.getParticipantRedisKey(sessionId), userId);
    if (!rawParticipant) {
      throw new NotFoundException('Participant not found');
    }

    const participant = JSON.parse(rawParticipant) as ParticipantState;
    if (participant.isFinished) {
      return { accepted: false, reason: 'PARTICIPANT_FINISHED' };
    }

    participant.tapCount += 1;
    participant.position = Math.min(runtimeState.trackLength, participant.position + runtimeState.stepDistance);

    let finishedCount = runtimeState.finishedCount;
    if (participant.position >= runtimeState.trackLength && !participant.isFinished) {
      finishedCount = await this.redis.hincrby(this.getGameStateRedisKey(sessionId), 'finishedCount', 1);
      participant.isFinished = true;
      participant.finishTime = Date.now();
      participant.finalRank = finishedCount;

      const participantRecord = await this.participantRepository.findOne({
        where: { id: participant.participantId },
      });

      if (participantRecord) {
        participantRecord.finalRank = participant.finalRank;
        await this.participantRepository.save(participantRecord);
      }
    }

    const totalTapCount = await this.redis.hincrby(this.getGameStateRedisKey(sessionId), 'totalTapCount', 1);
    await this.saveParticipantState(sessionId, participant);
    const allParticipants = await this.getParticipantsState(sessionId);
    const finishLimit = runtimeState.finishLimit || Math.min(5, allParticipants.length);
    const currentTopRankings = await this.getRealtimeRankings(sessionId, 5);

    const payload = {
      sessionId,
      participant: this.serializeParticipantState(participant),
      currentTopRankings,
      finishedCount,
      finishLimit,
      totalTapCount,
    };

    this.socketServer?.to(sessionId).emit('horse_position_update', payload);
    this.emitToDisplay('horse_position_update', payload);

    if (participant.isFinished) {
      const finishPayload = {
        sessionId,
        participant: this.serializeParticipantState(participant),
      };

      this.socketServer?.to(sessionId).emit('participant_finished', finishPayload);
      this.emitToDisplay('participant_finished', finishPayload);
    }

    if (finishedCount >= finishLimit) {
      await this.endGame(sessionId);
    }

    return {
      accepted: true,
      tapCount: participant.tapCount,
      currentPosition: participant.position,
      isFinished: participant.isFinished,
      finalRank: participant.finalRank,
    };
  }

  async endGame(sessionId: string) {
    await this.clearCountdownTimer(sessionId);
    this.stopSimulationLoop(sessionId);

    const session = await this.getSessionOrThrow(sessionId, ['host']);
    const runtimeState = await this.ensureRuntimeState(session);

    if (runtimeState.status === GameSessionStatus.FINISHED) {
      const finalRankings = await this.getFinalRankings(sessionId);
      return {
        sessionId,
        status: GameSessionStatus.FINISHED,
        finalRankings,
        podium: finalRankings.slice(0, 3),
      };
    }

    const participants = await this.getParticipantsState(sessionId);
    session.status = GameSessionStatus.FINISHED;
    session.endTime = new Date();
    await this.gameSessionRepository.save(session);

    const sorted = [...participants].sort((left, right) => {
      if (left.finalRank && right.finalRank) {
        return left.finalRank - right.finalRank;
      }
      if (left.finalRank) {
        return -1;
      }
      if (right.finalRank) {
        return 1;
      }
      if (right.position !== left.position) {
        return right.position - left.position;
      }
      return right.tapCount - left.tapCount;
    });

    let rollingRank = 1;
    for (const participant of sorted) {
      if (!participant.finalRank) {
        participant.finalRank = rollingRank;
      }
      rollingRank += 1;
      await this.saveParticipantState(sessionId, participant);

      const participantRecord = await this.participantRepository.findOne({
        where: { id: participant.participantId },
      });

      if (participantRecord) {
        participantRecord.finalRank = participant.finalRank;
        await this.participantRepository.save(participantRecord);
      }
    }

    await this.persistRuntimeState(sessionId, {
      status: GameSessionStatus.FINISHED,
      countdownEndsAt: null,
      finishedCount: sorted.filter((participant) => participant.isFinished).length,
    });

    const finalRankings = sorted.map((participant, index) =>
      this.serializePublicRanking(participant, index + 1),
    );

    const payload = {
      sessionId,
      status: GameSessionStatus.FINISHED,
      finalRankings,
      podium: finalRankings.slice(0, 3),
    };

    this.socketServer?.to(sessionId).emit('game_finished', payload);
    this.emitToDisplay('game_finished', payload);
    await this.broadcastSessionState(sessionId);

    return payload;
  }

  async getFinalRankings(sessionId: string) {
    const participants = await this.getParticipantsState(sessionId);

    return participants
      .sort((left, right) => {
        if (left.finalRank && right.finalRank) {
          return left.finalRank - right.finalRank;
        }
        return (left.finalRank || 999) - (right.finalRank || 999);
      })
      .map((participant, index) => this.serializePublicRanking(participant, index + 1));
  }

  async getRealtimeRankings(sessionId: string, limit = 5) {
    const participants = await this.getParticipantsState(sessionId);

    return participants
      .sort((left, right) => {
        if (left.isFinished && right.isFinished) {
          return (left.finalRank || 999) - (right.finalRank || 999);
        }
        if (left.isFinished) {
          return -1;
        }
        if (right.isFinished) {
          return 1;
        }
        if (right.position !== left.position) {
          return right.position - left.position;
        }
        return right.tapCount - left.tapCount;
      })
      .slice(0, limit)
      .map((participant, index) => this.serializePublicRanking(participant, index + 1));
  }

  async getParticipantState(sessionId: string, userId: string) {
    const participant = await this.redis.hget(this.getParticipantRedisKey(sessionId), userId);

    if (!participant) {
      throw new NotFoundException(`Participant ${userId} not found in session ${sessionId}`);
    }

    return this.serializeParticipantState(JSON.parse(participant) as ParticipantState);
  }

  onModuleDestroy() {
    this.countdownTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.countdownTimeouts.clear();

    this.simulationIntervals.forEach((interval) => clearInterval(interval));
    this.simulationIntervals.clear();
    this.simulationLocks.clear();
  }
}
