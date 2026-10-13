import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { ProjectRole, RoleScope } from '@repo/contracts';
import { AppendOnly } from '../../database/appendOnly.js';

export type ProjectRoleChangeType =
  'project_created' | 'member_added' | 'workspace_role_applied';

@AppendOnly()
@Entity({ name: 'project_member_role_history' })
export class ProjectMemberRoleHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'member_id', type: 'uuid' })
  memberId!: string;

  @Column({
    name: 'role_scope',
    type: 'varchar',
    length: 16,
    default: 'project',
  })
  roleScope!: RoleScope;

  @Column({ name: 'from_role', type: 'varchar', length: 20, nullable: true })
  fromRole!: ProjectRole | null;

  @Column({ name: 'to_role', type: 'varchar', length: 20, nullable: true })
  toRole!: ProjectRole | null;

  @Column({ name: 'change_type', type: 'varchar', length: 30 })
  changeType!: ProjectRoleChangeType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
