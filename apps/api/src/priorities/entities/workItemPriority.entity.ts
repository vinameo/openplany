import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { DefaultPriorityKey, Level, PriorityBand } from '@repo/contracts';

@Entity({ name: 'work_item_priorities' })
export class WorkItemPriority {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  level!: Level;

  @Column({ name: 'default_key', type: 'varchar', length: 32, nullable: true })
  defaultKey!: DefaultPriorityKey | null;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 40 })
  name!: string;

  @Column({ name: 'priority_band', type: 'varchar', length: 16 })
  band!: PriorityBand;

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
