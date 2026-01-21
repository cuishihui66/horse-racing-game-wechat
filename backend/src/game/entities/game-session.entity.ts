// backend/src/game/entities/game-session.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, Index } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Participant } from './participant.entity';
import { WallMessage } from '../../wall/entities/wall-message.entity'; // Import WallMessage

export enum GameSessionStatus {
  WAITING = 'waiting',
  QR_SCANNING = 'qr_scanning',
  READY_TO_START = 'ready_to_start',
  PLAYING = 'playing',
  FINISHED = 'finished',
  RESETTING = 'resetting', // Used for internal state during reset operation
}

@Entity('game_sessions')
export class GameSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.hostedSessions, { nullable: false })
  host: User;

  @Column({
    type: 'enum',
    enum: GameSessionStatus,
    default: GameSessionStatus.WAITING,
  })
  status: GameSessionStatus;

  @Column({ nullable: true, type: 'timestamptz' })
  startTime: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  endTime: Date;

  @Column({ nullable: true })
  qrCodeUrl: string; // QR code for joining game session

  @Column({ nullable: true })
  wallQrCodeUrl: string; // QR code for joining wall message

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Relationships
  @OneToMany(() => Participant, participant => participant.gameSession)
  participants: Participant[];

  @OneToMany(() => WallMessage, wallMessage => wallMessage.gameSession)
  wallMessages: WallMessage[];
}
