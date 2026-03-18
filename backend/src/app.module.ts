import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { validationSchema } from './config/validation-schema';
import { getTypeOrmConfig } from './database/typeorm.config';
import { AuthModule } from './auth/auth.module';
import { GameModule } from './game/game.module';
import { WallModule } from './wall/wall.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      validationSchema,
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => getTypeOrmConfig(configService),
      inject: [ConfigService],
    }),
    AuthModule,
    GameModule,
    WallModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
