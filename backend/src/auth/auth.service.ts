// backend/src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private httpService: HttpService,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  async wechatLogin(code: string) {
    const { appId, appSecret } = this.configService.get('wechat');
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;

    const response = await this.httpService.get(url).toPromise();
    const data = response.data;

    if (data.errcode) {
      throw new UnauthorizedException(data.errmsg);
    }

    let user = await this.usersRepository.findOne({ where: { wechatOpenid: data.openid } });

    if (!user) {
      user = this.usersRepository.create({
        wechatOpenid: data.openid,
        // wechatNickname and avatarUrl will be updated later via mini-program user info API if provided
      });
      await this.usersRepository.save(user);
    }

    const payload = { sub: user.id, openid: user.wechatOpenid };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user.id, openid: user.wechatOpenid, nickname: user.wechatNickname, avatarUrl: user.avatarUrl },
    };
  }

  // Method to update user info (e.g., from mini-program wx.getUserInfo)
  async updateUserInfo(userId: string, nickname?: string, avatarUrl?: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    user.wechatNickname = nickname || user.wechatNickname;
    user.avatarUrl = avatarUrl || user.avatarUrl;
    return this.usersRepository.save(user);
  }
}
