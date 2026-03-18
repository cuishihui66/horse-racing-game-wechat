import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { nanoid } from 'nanoid';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  private buildAuthResponse(user: User) {
    const payload = { sub: user.id, openid: user.wechatOpenid };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        openid: user.wechatOpenid,
        nickname: user.wechatNickname,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  private ensureDevAuthEnabled() {
    if (!this.configService.get<boolean>('devAuthMode')) {
      throw new ForbiddenException('Dev auth mode is disabled');
    }
  }

  private async findOrCreateUser(wechatOpenid: string, nickname: string, avatarUrl?: string) {
    let user = await this.usersRepository.findOne({ where: { wechatOpenid } });

    if (!user) {
      user = this.usersRepository.create({
        wechatOpenid,
        wechatNickname: nickname,
        avatarUrl,
      });
    } else {
      user.wechatNickname = nickname || user.wechatNickname;
      user.avatarUrl = avatarUrl || user.avatarUrl;
    }

    return this.usersRepository.save(user);
  }

  async wechatLogin(code: string) {
    const { appId, appSecret } = this.configService.get('wechat');
    if (!appId || !appSecret) {
      throw new UnauthorizedException('WeChat credentials are not configured');
    }

    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}` +
      `&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;

    const response = await firstValueFrom(this.httpService.get(url));
    const data = response.data;

    if (data.errcode) {
      throw new UnauthorizedException(data.errmsg);
    }

    let user = await this.usersRepository.findOne({ where: { wechatOpenid: data.openid } });

    if (!user) {
      user = this.usersRepository.create({
        wechatOpenid: data.openid,
      });
      await this.usersRepository.save(user);
    }

    return this.buildAuthResponse(user);
  }

  async devHostLogin(username?: string, password?: string) {
    this.ensureDevAuthEnabled();

    const expectedUsername = this.configService.get<string>('devHostUsername');
    const expectedPassword = this.configService.get<string>('devHostPassword');

    if ((username || expectedUsername) !== expectedUsername || (password || expectedPassword) !== expectedPassword) {
      throw new UnauthorizedException('Invalid dev host credentials');
    }

    const user = await this.findOrCreateUser(
      'dev-host-admin',
      'Admin',
      'https://via.placeholder.com/96?text=HOST',
    );

    return this.buildAuthResponse(user);
  }

  async devUserLogin(nickname?: string, openid?: string) {
    this.ensureDevAuthEnabled();

    const resolvedNickname = (nickname || '').trim() || `测试用户-${nanoid(4)}`;
    const resolvedOpenid = (openid || '').trim() || `dev-user-${resolvedNickname}-${nanoid(6)}`;
    const avatarSeed = encodeURIComponent(resolvedNickname.slice(0, 2));
    const user = await this.findOrCreateUser(
      resolvedOpenid,
      resolvedNickname,
      `https://via.placeholder.com/96?text=${avatarSeed}`,
    );

    return this.buildAuthResponse(user);
  }

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
