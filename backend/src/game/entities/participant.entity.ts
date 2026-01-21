// backend/src/game/entities/participant.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { GameSession } from './game-session.entity';

@Entity('participants')
@Index(['gameSession', 'user'], { unique: true }) // A user can only participate once per game session
export class Participant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.participations, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => GameSession, gameSession => gameSession.participants, { nullable: false, onDelete: 'CASCADE' })
  gameSession: GameSession;

  @Column({ nullable: true }) // URL to the assigned horse image
  horseImageUrl: string;

  @Column({ nullable: true }) // Final rank in the game
  finalRank: number;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt: Date;
}
