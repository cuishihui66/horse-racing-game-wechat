// backend/src/auth/entities/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { GameSession } from '../../game/entities/game-session.entity';
import { Participant } from '../../game/entities/participant.entity';

@Entity('users') // Table name
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true }) // wechatOpenid can be null initially if user info is not fetched
  wechatOpenid: string;

  @Column({ nullable: true })
  wechatNickname: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Relationships
  @OneToMany(() => GameSession, session => session.host)
  hostedSessions: GameSession[];

  @OneToMany(() => Participant, participant => participant.user)
  participations: Participant[];
}
