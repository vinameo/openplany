import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { StateGroup, StateLevel } from '@repo/contracts';

@Entity({ name: 'work_item_states' })
export class WorkItemState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  level!: StateLevel;

  @Column({ name: 'default_key', type: 'varchar', length: 32, nullable: true })
  defaultKey!: string | null;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 40 })
  name!: string;

  @Column({ name: 'state_group', type: 'varchar', length: 16 })
  group!: StateGroup;

  @Column({ type: 'varchar', length: 7 })
  color!: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @Column({ name: 'deleted_by_id', type: 'uuid', nullable: true })
  deletedById!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
