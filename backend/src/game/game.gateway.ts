// backend/src/game/game.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsResponse,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt-auth.guard'; // Custom WS guard
import { JwtService } from '@nestjs/jwt'; // For token validation in handleConnection
import { ConfigService } from '@nestjs/config';
import { GameSessionStatus } from './entities/game-session.entity';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

interface AuthenticatedSocket extends Socket {
  data: { user: { sub: string; openid: string } }; // sub is userId
}

@WebSocketGateway({
  cors: {
    origin: '*', // Allow all origins for development, refine in production
    credentials: true,
  },
  // If using a path for WS, e.g., 'ws://localhost:3000/game-socket'
  // path: '/game-socket',
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() public server: Server; // Make public to be accessible from GameService
  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly gameService: GameService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    // Pass the Socket.IO server instance to the GameService so it can broadcast events
    this.gameService.setSocketServer(server);
  }

  async handleConnection(@ConnectedSocket() client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);

    // Extract token from handshake query or headers
    const token = client.handshake.auth?.token as string || client.handshake.query?.token as string;
    const clientType = client.handshake.query?.type as string; // 'mini_program' or 'large_screen'
    const sessionId = client.handshake.query?.sessionId as string;

    if (!token) {
      this.logger.warn(`Client ${client.id} disconnected: No authentication token provided.`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwtSecret'),
      });
      // Attach user info to client socket.data
      (client as AuthenticatedSocket).data.user = payload;
      this.logger.log(`Client ${client.id} authenticated as user ${payload.sub} (${clientType}).`);

      // Clients (mini-program & large screen) should join a room specific to their game session
      if (sessionId) {
        await client.join(sessionId);
        this.logger.log(`Client ${client.id} (${clientType}) joined session room: ${sessionId}`);

        // If it's a large screen client, send initial game state
        if (clientType === 'large_screen') {
            const gameState = await this.gameService.getGameSessionState(sessionId);
            client.emit('game_state_init', gameState);
        } else if (clientType === 'mini_program' && payload.sub) {
            // For mini-program, send their specific horse state and current game status
            const participantState = await this.gameService.getParticipantState(sessionId, payload.sub);
            client.emit('my_game_state', { sessionId, participantState, status: gameState.status });
        }
      } else {
          this.logger.warn(`Client ${client.id} (${clientType}) connected without sessionId.`);
          client.disconnect(true);
      }

    } catch (e) {
      this.logger.error(`Client ${client.id} authentication failed: ${e.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Potentially clean up or notify other clients if a critical client (e.g., host) disconnects
  }

  // Mini-Program Accelerate Event
  @UseGuards(WsJwtAuthGuard) // Protect WebSocket events with JWT
  @SubscribeMessage('accelerate')
  async handleAccelerate(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.user.sub;
    const { sessionId } = data;

    // Delegate to GameService for game logic
    await this.gameService.handleAccelerate(sessionId, userId);

    // No need to send response back to individual client here,
    // GameService will broadcast updates globally for this session.
    // Or if immediate client feedback is needed, it's done within GameService
    // via this.server.to(client.id).emit(...)
    // return { event: 'accelerate_ack', data: { success: true } }; // Optional Acknowledge
  }

  // Host Controls via WebSocket (Optional, can also be REST API)
  // For simplicity, we keep host controls as REST API, but here's an example:
  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_start_game')
  async handleHostStartGame(@MessageBody() data: { sessionId: string }, @ConnectedSocket() client: AuthenticatedSocket) {
      // TODO: Implement logic in GameService to verify if client.data.user.sub is the host of sessionId
      // For now, assume any authenticated user can try to start (needs refinement)
      try {
          await this.gameService.startGame(data.sessionId);
          // GameService will handle broadcasting 'game_started' event
      } catch (error) {
          this.logger.error(`Host failed to start game ${data.sessionId}: ${error.message}`);
          client.emit('error', { message: error.message });
      }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_reset_game')
  async handleHostResetGame(@MessageBody() data: { sessionId: string }, @ConnectedSocket() client: AuthenticatedSocket) {
      // TODO: Implement host verification
      try {
          await this.gameService.resetGame(data.sessionId);
          // GameService will handle broadcasting 'game_reset' event
      } catch (error) {
          this.logger.error(`Host failed to reset game ${data.sessionId}: ${error.message}`);
          client.emit('error', { message: error.message });
      }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_start_qr_scan')
  async handleHostStartQrScan(@MessageBody() data: { sessionId: string; durationSeconds: number }, @ConnectedSocket() client: AuthenticatedSocket) {
      // TODO: Implement host verification
      try {
          await this.gameService.startGameScanPhase(data.sessionId, data.durationSeconds);
          // GameService will handle broadcasting 'qr_scan_started' event
      } catch (error) {
          this.logger.error(`Host failed to start QR scan for game ${data.sessionId}: ${error.message}`);
          client.emit('error', { message: error.message });
      }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_stop_qr_scan')
  async handleHostStopQrScan(@MessageBody() data: { sessionId: string }, @ConnectedSocket() client: AuthenticatedSocket) {
      // TODO: Implement host verification
      try {
          await this.gameService.endGameScanPhase(data.sessionId);
          // GameService will handle broadcasting 'qr_scan_ended' event
      } catch (error) {
          this.logger.error(`Host failed to stop QR scan for game ${data.sessionId}: ${error.message}`);
          client.emit('error', { message: error.message });
      }
  }
}
