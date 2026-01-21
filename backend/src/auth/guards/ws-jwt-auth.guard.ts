// backend/src/auth/guards/ws-jwt-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport'; // Not directly used, but for context
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<any>(); // Get the WebSocket client (socket.io socket)
    const authHeader = client.handshake.headers.authorization || client.handshake.auth.token;

    if (!authHeader) {
      this.logger.warn(`Client ${client.id} tried to connect to protected WS event without token.`);
      throw new WsException('Unauthorized: No token provided');
    }

    const token = authHeader.split(' ')[1] || authHeader; // Extract token from 'Bearer <token>' or directly from auth.token

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwtSecret'),
      });
      // Attach user info to client socket.data
      client.data.user = payload;
      return true;
    } catch (e) {
      this.logger.error(`Client ${client.id} WS token verification failed: ${e.message}`);
      throw new WsException('Unauthorized: Invalid token');
    }
  }
}
