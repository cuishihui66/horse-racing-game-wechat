// backend/src/game/entities/participant.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { GameSession } from './game-session.entity';

@Entity('participants')
@Index(['gameSession', 'user'], { unique: true })
export class Participant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.participations, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => GameSession, gameSession => gameSession.participants, { nullable: false, onDelete: 'CASCADE' })
  gameSession: GameSession;

  @Column({ nullable: true })
  horseImageUrl: string;

  @Column({ nullable: true })
  horseStyle: string;

  @Column({ nullable: true })
  horseColor: string;

  @Column({ nullable: true })
  horseAccentColor: string;

  @Column({ nullable: true })
  laneNumber: number;

  @Column({ nullable: true })
  finalRank: number;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt: Date;
}
