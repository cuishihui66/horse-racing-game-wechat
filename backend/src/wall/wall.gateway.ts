// backend/src/wall/wall.gateway.ts
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
import { WallService } from './wall.service';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  data: { user: { sub: string; openid: string; type?: string } }; // sub is userId
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  // path: '/wall-socket', // Optional: dedicated path for wall messages
})
export class WallGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() public server: Server;
  private readonly logger = new Logger(WallGateway.name);

  constructor(
    private readonly wallService: WallService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Wall WebSocket Gateway initialized');
    this.wallService.setSocketServer(server); // Pass server instance to service
  }

  async handleConnection(@ConnectedSocket() client: Socket, ...args: any[]) {
    this.logger.log(`Wall Client connected: ${client.id}`);

    const token = client.handshake.auth?.token as string || client.handshake.query?.token as string;
    const clientType = client.handshake.query?.type as string; // 'mini_program', 'large_screen', 'host_panel'
    const sessionId = client.handshake.query?.sessionId as string;

    if (!token) {
      this.logger.warn(`Wall Client ${client.id} disconnected: No authentication token provided.`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwtSecret'),
      });
      (client as AuthenticatedSocket).data.user = payload;
      (client as AuthenticatedSocket).data.user.type = clientType; // Store client type in socket data for later use

      this.logger.log(`Wall Client ${client.id} authenticated as user ${payload.sub} (${clientType}).`);

      if (sessionId) {
        // All wall message clients join their session room
        await client.join(sessionId);
        this.logger.log(`Wall Client ${client.id} (${clientType}) joined session room: ${sessionId}`);

        // Host panel clients also join a specific host room for receiving pending messages
        if (clientType === 'host_panel') {
            await client.join(`host-${sessionId}`);
            this.logger.log(`Host Client ${client.id} joined host room for session: ${sessionId}`);
            // On host connect, send them pending messages for this session
            const pendingMessages = await this.wallService.getPendingWallMessages(sessionId);
            client.emit('pending_wall_messages', pendingMessages);
            // Also send approved messages for initial view
            const approvedMessages = await this.wallService.getApprovedWallMessages(sessionId);
            client.emit('approved_wall_messages_init', approvedMessages);
        }

        // Large screen clients, on connect, request approved messages for initial display
        if (clientType === 'large_screen') {
            const approvedMessages = await this.wallService.getApprovedWallMessages(sessionId);
            client.emit('approved_wall_messages_init', approvedMessages);
        }
      } else {
          this.logger.warn(`Wall Client ${client.id} (${clientType}) connected without sessionId.`);
          client.disconnect(true);
      }

    } catch (e) {
      this.logger.error(`Wall Client ${client.id} authentication failed: ${e.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Wall Client disconnected: ${client.id}`);
  }

  // Mini-Program submits message (can also be REST, but WS is good for real-time ack)
  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('submit_wall_message')
  async handleSubmitWallMessage(
    @MessageBody() data: { sessionId: string; type: WallMessageType; content?: string; imageUrl?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<WsResponse<any>> {
    const userId = client.data.user.sub;
    const { sessionId, type, content, imageUrl } = data;

    try {
      const wallMessage = await this.wallService.submitWallMessage(
        sessionId,
        userId,
        type,
        content,
        imageUrl,
      );
      return { event: 'submit_wall_message_ack', data: { success: true, messageId: wallMessage.id, status: wallMessage.status } };
    } catch (error) {
      this.logger.error(`User ${userId} failed to submit wall message to session ${sessionId}: ${error.message}`);
      return { event: 'submit_wall_message_ack', data: { success: false, error: error.message } };
    }
  }

  // Host action (via WebSocket - alternative to REST API for real-time control)
  // These events can also be exposed as REST APIs in WallController as currently done

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_approve_wall_message')
  async handleHostApproveWallMessage(
    @MessageBody() data: { sessionId: string; messageId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const hostId = client.data.user.sub;
    try {
      await this.wallService.approveWallMessage(data.messageId, hostId);
    } catch (error) {
      this.logger.error(`Host ${hostId} failed to approve message ${data.messageId}: ${error.message}`);
      client.emit('exception', { message: error.message });
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_reject_wall_message')
  async handleHostRejectWallMessage(
    @MessageBody() data: { sessionId: string; messageId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const hostId = client.data.user.sub;
    try {
      await this.wallService.rejectWallMessage(data.messageId, hostId);
    } catch (error) {
      this.logger.error(`Host ${hostId} failed to reject message ${data.messageId}: ${error.message}`);
      client.emit('exception', { message: error.message });
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_delete_wall_message')
  async handleHostDeleteWallMessage(
    @MessageBody() data: { sessionId: string; messageId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const hostId = client.data.user.sub;
    try {
      await this.wallService.deleteWallMessage(data.messageId, hostId);
    } catch (error) {
      this.logger.error(`Host ${hostId} failed to delete message ${data.messageId}: ${error.message}`);
      client.emit('exception', { message: error.message });
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('host_toggle_top_wall_message')
  async handleHostToggleTopWallMessage(
    @MessageBody() data: { sessionId: string; messageId: string; isTop: boolean },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const hostId = client.data.user.sub;
    try {
      await this.wallService.toggleTopWallMessage(data.messageId, hostId, data.isTop);
    } catch (error) {
      this.logger.error(`Host ${hostId} failed to toggle top status for message ${data.messageId}: ${error.message}`);
      client.emit('exception', { message: error.message });
    }
  }
}
