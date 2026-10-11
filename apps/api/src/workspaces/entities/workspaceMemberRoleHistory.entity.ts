import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { WorkspaceRole } from '@repo/contracts';
import { AppendOnly } from '../../database/appendOnly.js';

export type WorkspaceRoleChangeType =
  'workspace_created' | 'member_added' | 'role_changed' | 'member_removed';

/** Append-only log of workspace role changes (RQ INV-09): insert, never update or delete. */
@AppendOnly()
@Entity({ name: 'workspace_member_role_history' })
export class WorkspaceMemberRoleHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'from_role', type: 'varchar', length: 20, nullable: true })
  fromRole: WorkspaceRole | null;

  @Column({ name: 'to_role', type: 'varchar', length: 20, nullable: true })
  toRole: WorkspaceRole | null;

  @Column({ name: 'change_type', type: 'varchar', length: 30 })
  changeType: WorkspaceRoleChangeType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
