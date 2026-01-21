// backend/src/auth/auth.controller.ts
import { Controller, Post, Body, UseGuards, Request, Put } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport'; // For JWT authentication
import { User } from './entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('wechat-login')
  async wechatLogin(@Body('code') code: string) {
    return this.authService.wechatLogin(code);
  }

  // Example protected route to get user profile
  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req): User {
    return req.user;
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('user-info')
  async updateUserInfo(@Request() req, @Body('nickname') nickname: string, @Body('avatarUrl') avatarUrl: string) {
    return this.authService.updateUserInfo(req.user.id, nickname, avatarUrl);
  }
}
