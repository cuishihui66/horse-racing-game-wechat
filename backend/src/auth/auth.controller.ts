import { Controller, Post, Body, UseGuards, Request, Put, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { User } from './entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('wechat-login')
  async wechatLogin(@Body('code') code: string) {
    return this.authService.wechatLogin(code);
  }

  @Post('dev-host-login')
  async devHostLogin(
    @Body('username') username?: string,
    @Body('password') password?: string,
  ) {
    return this.authService.devHostLogin(username, password);
  }

  @Post('dev-user-login')
  async devUserLogin(
    @Body('nickname') nickname?: string,
    @Body('openid') openid?: string,
  ) {
    return this.authService.devUserLogin(nickname, openid);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req): User {
    return req.user;
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('user-info')
  async updateUserInfo(
    @Request() req,
    @Body('nickname') nickname: string,
    @Body('avatarUrl') avatarUrl: string,
  ) {
    return this.authService.updateUserInfo(req.user.id, nickname, avatarUrl);
  }
}
