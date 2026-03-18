// backend/src/game/entities/game-session.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Participant } from './participant.entity';
import { WallMessage } from '../../wall/entities/wall-message.entity';

export enum GameSessionStatus {
  WAITING = 'waiting',
  QR_SCANNING = 'qr_scanning',
  READY_TO_START = 'ready_to_start',
  COUNTDOWN = 'countdown',
  PLAYING = 'playing',
  FINISHED = 'finished',
  RESETTING = 'resetting',
}

@Entity('game_sessions')
export class GameSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.hostedSessions, { nullable: false })
  host: User;

  @Column({ default: '赛马摇一摇' })
  title: string;

  @Column({
    type: 'enum',
    enum: GameSessionStatus,
    default: GameSessionStatus.QR_SCANNING,
  })
  status: GameSessionStatus;

  @Column({ nullable: true, type: 'timestamptz' })
  startTime: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  endTime: Date;

  @Column({ nullable: true })
  qrCodeUrl: string;

  @Column({ nullable: true })
  wallQrCodeUrl: string;

  @Column({ type: 'float', default: 0.72 })
  wallOpacity: number;

  @Column({ default: 3 })
  countdownSeconds: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Participant, participant => participant.gameSession)
  participants: Participant[];

  @OneToMany(() => WallMessage, wallMessage => wallMessage.gameSession)
  wallMessages: WallMessage[];
}
