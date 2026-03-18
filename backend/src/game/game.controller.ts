import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GameService } from './game.service';
import { User } from '../auth/entities/user.entity';
import { JoinGameDto } from './dto/join-game.dto';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('create-session')
  async createSession(
    @Body('title') title: string | undefined,
    @Request() req: { user: User },
  ) {
    return this.gameService.createGameSession(req.user.id, title);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('sessions')
  async listSessions(@Request() req: { user: User }) {
    return this.gameService.listSessionsForHost(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('current-display')
  async getCurrentDisplaySession() {
    return this.gameService.getCurrentDisplaySessionState();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/start-qr-scan')
  async reopenJoin(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: User },
  ) {
    return this.gameService.startGameScanPhase(sessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/prepare')
  async prepareGame(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: User },
  ) {
    return this.gameService.prepareGame(sessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/end-qr-scan')
  async endQrScan(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: User },
  ) {
    return this.gameService.endGameScanPhase(sessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/start')
  async startGame(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: User },
  ) {
    return this.gameService.startGame(sessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/dev/fake-users')
  async createFakeUsers(
    @Param('sessionId') sessionId: string,
    @Body('count') count: number,
    @Request() req: { user: User },
  ) {
    return this.gameService.createFakeParticipants(sessionId, req.user.id, count);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/dev/simulation/start')
  async startBotSimulation(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: User },
  ) {
    return this.gameService.startBotSimulation(sessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/dev/simulation/stop')
  async stopBotSimulation(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: User },
  ) {
    return this.gameService.stopBotSimulation(sessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/reset')
  async resetGame(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: User },
  ) {
    return this.gameService.resetGame(sessionId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/wall-settings')
  async updateWallSettings(
    @Param('sessionId') sessionId: string,
    @Body('wallOpacity') wallOpacity: number,
    @Request() req: { user: User },
  ) {
    return this.gameService.updateWallSettings(sessionId, req.user.id, wallOpacity);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':sessionId/state')
  async getSessionState(@Param('sessionId') sessionId: string) {
    return this.gameService.getGameSessionState(sessionId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':sessionId/results')
  async getResults(@Param('sessionId') sessionId: string) {
    return this.gameService.getFinalRankings(sessionId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/join')
  async joinGame(
    @Param('sessionId') sessionId: string,
    @Body() joinGameDto: JoinGameDto,
    @Request() req: { user: User },
  ) {
    return this.gameService.joinGame(
      sessionId,
      req.user.id,
      joinGameDto.wechatNickname,
      joinGameDto.avatarUrl,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':sessionId/accelerate')
  async accelerate(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: User },
  ) {
    return this.gameService.handleAccelerate(sessionId, req.user.id);
  }
}
