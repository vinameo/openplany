import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { OrganizationSize } from '@repo/contracts';

@Entity({ name: 'workspaces' })
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 48 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  logo: string | null;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById: string | null;

  @Column({ name: 'organization_size', type: 'varchar', length: 20 })
  organizationSize: OrganizationSize;

  @Column({ type: 'varchar', length: 255 })
  timezone: string;

  @Column({ name: 'background_color', type: 'varchar', length: 7 })
  backgroundColor: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

