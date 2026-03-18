import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GameService } from './game.service';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt-auth.guard';

interface AuthenticatedSocket extends Socket {
  data: { user: { sub: string; openid: string } };
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() public server: Server;
  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly gameService: GameService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    this.gameService.setSocketServer(server);
  }

  async handleConnection(@ConnectedSocket() client: Socket) {
    const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
    const clientType = client.handshake.query?.type as string;
    const sessionId = client.handshake.query?.sessionId as string | undefined;

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwtSecret'),
      });

      (client as AuthenticatedSocket).data.user = payload;

      if (clientType === 'large_screen' && !sessionId) {
        await client.join('display-global');
        const currentState = await this.gameService.getCurrentDisplaySessionState();
        if (currentState) {
          client.emit('game_state_init', currentState);
        }
        return;
      }

      if (!sessionId) {
        client.disconnect(true);
        return;
      }

      await client.join(sessionId);
      this.logger.log(`Client ${client.id} (${clientType || 'unknown'}) joined session ${sessionId}`);

      if (clientType === 'host_panel' || clientType === 'large_screen') {
        client.emit('game_state_init', await this.gameService.getGameSessionState(sessionId));
      }

      if (clientType === 'mini_program' && payload.sub) {
        let participantState = null;
        try {
          participantState = await this.gameService.getParticipantState(sessionId, payload.sub);
        } catch (error) {
          this.logger.warn(`Mini-program user ${payload.sub} not joined session ${sessionId} yet.`);
        }

        client.emit('my_game_state', {
          sessionId,
          participantState,
          sessionState: await this.gameService.getGameSessionState(sessionId),
        });
      }
    } catch (error) {
      this.logger.error(`Socket auth failed for ${client.id}: ${error.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('accelerate')
  async handleAccelerate(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    return this.gameService.handleAccelerate(data.sessionId, client.data.user.sub);
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_prepare_game')
  async handlePrepareGame(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      return await this.gameService.prepareGame(data.sessionId, client.data.user.sub);
    } catch (error) {
      client.emit('exception', { message: error.message });
      return null;
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_start_game')
  async handleHostStartGame(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      return await this.gameService.startGame(data.sessionId, client.data.user.sub);
    } catch (error) {
      client.emit('exception', { message: error.message });
      return null;
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_reset_game')
  async handleHostResetGame(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      return await this.gameService.resetGame(data.sessionId, client.data.user.sub);
    } catch (error) {
      client.emit('exception', { message: error.message });
      return null;
    }
  }
}
