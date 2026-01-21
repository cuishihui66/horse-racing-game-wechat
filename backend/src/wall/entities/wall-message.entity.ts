// backend/src/wall/entities/wall-message.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { GameSession } from '../../game/entities/game-session.entity';
import { User } from '../../auth/entities/user.entity';

export enum WallMessageType {
  TEXT = 'text',
  IMAGE = 'image',
  TEXT_AND_IMAGE = 'text_image',
}

export enum WallMessageStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('wall_messages')
export class WallMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => GameSession, gameSession => gameSession.wallMessages, { nullable: false, onDelete: 'CASCADE' })
  gameSession: GameSession;

  @ManyToOne(() => User, user => user.wallMessages, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @Column({ nullable: true })
  wechatNickname: string; // Denormalized for easier access

  @Column({ nullable: true })
  avatarUrl: string; // Denormalized for easier access

  @Column({
    type: 'enum',
    enum: WallMessageType,
    default: WallMessageType.TEXT,
  })
  type: WallMessageType;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({
    type: 'enum',
    enum: WallMessageStatus,
    default: WallMessageStatus.PENDING,
  })
  status: WallMessageStatus;

  @Column({ default: false })
  isTop: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  approvedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  approvedBy: User; // Host who approved the message
}
