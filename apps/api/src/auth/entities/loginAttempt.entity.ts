import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const LOGIN_RESULTS = ['success', 'failure', 'blocked'] as const;
export type LoginResult = (typeof LOGIN_RESULTS)[number];

/** Mirrors login_attempts_reason_check; maps to rules 1–9 of login-analysis.md. */
export const LOGIN_FAILURE_REASONS = [
  'unknown_email',
  'masked',
  'bot',
  'password_not_set',
  'wrong_password',
  'inactive',
  'managed_sso',
  'not_superuser',
  'rate_limited',
  'reset_required',
] as const;
export type LoginReason = (typeof LOGIN_FAILURE_REASONS)[number];

@Entity({ name: 'login_attempts' })
export class LoginAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'email_hash', type: 'varchar', length: 64 })
  emailHash: string;

  @Column({ type: 'varchar', length: 45 })
  ip: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 20 })
  medium: string;

  @Column({ type: 'varchar', length: 20 })
  result: LoginResult;

  @Column({ type: 'varchar', length: 30, nullable: true })
  reason: LoginReason | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
