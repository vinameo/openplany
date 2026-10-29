import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { ProjectRole, RoleScope } from '@repo/contracts';

@Entity({ name: 'project_members' })
export class ProjectMember {
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

  @Column({ type: 'varchar', length: 20 })
  role!: ProjectRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
