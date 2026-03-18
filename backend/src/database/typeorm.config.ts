import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../auth/entities/user.entity';
import { GameSession } from '../game/entities/game-session.entity';
import { Participant } from '../game/entities/participant.entity';
import { WallMessage } from '../wall/entities/wall-message.entity';

export const getTypeOrmConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('database.host'),
  port: configService.get<number>('database.port'),
  username: configService.get<string>('database.username'),
  password: configService.get<string>('database.password'),
  database: configService.get<string>('database.database'),
  entities: [User, GameSession, Participant, WallMessage],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development' ? ['query', 'error', 'schema'] : ['error'],
});
