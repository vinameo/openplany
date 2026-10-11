import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RoleScope } from '@repo/contracts';
import { AppendOnly } from '../../database/appendOnly.js';

export type RolePermissionChangeType = 'seeded' | 'granted' | 'revoked';

/** Append-only log of grants and revokes (RQ INV-09): insert, never update or delete. */
@AppendOnly()
@Entity({ name: 'role_permission_history' })
export class RolePermissionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  scope: RoleScope;

  @Column({ name: 'role_key', type: 'varchar', length: 20 })
  roleKey: string;

  @Column({ name: 'permission_key', type: 'varchar', length: 100 })
  permissionKey: string;

  @Column({ name: 'change_type', type: 'varchar', length: 16 })
  changeType: RolePermissionChangeType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
