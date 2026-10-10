import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RoleScope, WorkspaceRole } from '@repo/contracts';

@Entity({ name: 'workspace_members' })
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'role_scope', type: 'varchar', length: 16, default: 'workspace' })
  roleScope: RoleScope;

  @Column({ type: 'varchar', length: 20 })
  role: WorkspaceRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

