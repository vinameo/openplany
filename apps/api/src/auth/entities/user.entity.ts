import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Login-relevant columns of `users` (database-spec 3.1). */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 128 })
  username: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 255, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 255, nullable: true })
  lastName: string | null;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  displayName: string | null;

  @Column({ type: 'text', nullable: true })
  avatar: string | null;

  @Column({ name: 'user_timezone', type: 'varchar', length: 255 })
  timezone: string;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'last_login', type: 'timestamptz', nullable: true })
  lastLogin: Date | null;

  @Column({ name: 'last_login_time', type: 'timestamptz', nullable: true })
  lastLoginTime: Date | null;

  @Column({ name: 'last_logout_time', type: 'timestamptz', nullable: true })
  lastLogoutTime: Date | null;

  @Column({ name: 'last_active', type: 'timestamptz', nullable: true })
  lastActive: Date | null;

  @Column({
    name: 'last_login_ip',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  lastLoginIp: string | null;

  @Column({
    name: 'last_logout_ip',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  lastLogoutIp: string | null;

  @Column({
    name: 'last_login_medium',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  lastLoginMedium: string | null;

  @Column({ name: 'last_login_uagent', type: 'text', nullable: true })
  lastLoginUserAgent: string | null;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean;

  @Column({ name: 'is_bot', type: 'boolean' })
  isBot: boolean;

  @Column({ name: 'masked_at', type: 'timestamptz', nullable: true })
  maskedAt: Date | null;

  @Column({ name: 'is_managed', type: 'boolean' })
  isManaged: boolean;

  @Column({ name: 'is_password_autoset', type: 'boolean' })
  isPasswordAutoset: boolean;

  @Column({ name: 'is_password_expired', type: 'boolean' })
  isPasswordExpired: boolean;

  @Column({ name: 'is_password_reset_required', type: 'boolean' })
  isPasswordResetRequired: boolean;

  @Column({ name: 'is_email_verified', type: 'boolean' })
  isEmailVerified: boolean;

  @Column({ name: 'is_superuser', type: 'boolean' })
  isSuperuser: boolean;

  @Column({ name: 'last_workspace_id', type: 'uuid', nullable: true })
  lastWorkspaceId: string | null;
}
