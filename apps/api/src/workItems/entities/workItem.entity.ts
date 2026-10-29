import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'work_items' })
export class WorkItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'state_id', type: 'uuid' })
  stateId!: string;

  @Column({ name: 'priority_id', type: 'uuid' })
  priorityId!: string;

  @Column({ name: 'number', type: 'integer' })
  number!: number;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'description', type: 'text', default: '' })
  description!: string;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey!: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
