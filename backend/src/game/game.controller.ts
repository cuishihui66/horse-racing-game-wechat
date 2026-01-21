// backend/src/game/game.controller.ts
import { Controller, Post, Body, Param, Get, UseGuards, Request, Query, ParseIntPipe } from '@nestjs/common';
import { GameService } from './game.service';
import { AuthGuard } from '@nestjs/passport'; // For JWT authentication
import { User } from '../auth/entities/user.entity';

// DTOs for request/response validation
import { CreateGameSessionDto } from './dto/create-game-session.dto';
import { JoinGameDto } from './dto/join-game.dto';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  // --- Host API ---
  @UseGuards(AuthGuard('jwt'))
  @Post('create-session')
  async createSession(@Request() req: { user: User }) {
    // In a real app, verify if req.user is an authorized host
    return this.gameService.createGameSession(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/start-qr-scan')
  async startQrScan(
    @Param('sessionId') sessionId: string,
    @Body('durationSeconds', ParseIntPipe) durationSeconds: number,
    @Request() req: { user: User }
  ) {
    // Verify host ownership for sessionId
    // const gameSession = await this.gameService.getGameSession(sessionId); // Example check
    // if (gameSession.host.id !== req.user.id) {
    //   throw new UnauthorizedException('Only the host can start QR scan');
    // }
    return this.gameService.startGameScanPhase(sessionId, durationSeconds);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/end-qr-scan')
  async endQrScan(@Param('sessionId') sessionId: string, @Request() req: { user: User }) {
    // Verify host ownership
    return this.gameService.endGameScanPhase(sessionId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/start')
  async startGame(@Param('sessionId') sessionId: string, @Request() req: { user: User }) {
    // Verify host ownership
    return this.gameService.startGame(sessionId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/reset')
  async resetGame(@Param('sessionId') sessionId: string, @Request() req: { user: User }) {
    // Verify host ownership
    return this.gameService.resetGame(sessionId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':sessionId/state')
  async getSessionState(@Param('sessionId') sessionId: string, @Request() req: { user: User }) {
    // Verify host ownership or allow public read
    return this.gameService.getGameSessionState(sessionId);
  }

  // --- Mini-Program Client API ---
  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/join')
  async joinGame(
    @Param('sessionId') sessionId: string,
    @Body() joinGameDto: JoinGameDto, // DTO includes nickname, avatarUrl if provided
    @Request() req: { user: User }
  ) {
    // req.user.id is the authenticated user's ID
    return this.gameService.joinGame(req.user.id, sessionId, joinGameDto.wechatNickname, joinGameDto.avatarUrl);
  }

  // Add DTOs for validation and clearer request bodies
  // dto/create-game-session.dto.ts
  // export class CreateGameSessionDto { /* no body needed, hostId from token */ }

  // dto/join-game.dto.ts
  // import { IsString, IsOptional } from 'class-validator';
  // export class JoinGameDto {
  //   @IsString()
  //   wechatNickname: string;
  //
  //   @IsOptional()
  //   @IsString()
  //   avatarUrl?: string;
  // }
}
