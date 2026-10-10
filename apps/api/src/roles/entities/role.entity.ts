import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { RoleScope } from '@repo/contracts';

@Entity({ name: 'roles' })
export class Role {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  scope: RoleScope;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  key: string;

  /** Bumped on every change to this role's permissions (optimistic check). */
  @Column({ name: 'permissions_version', type: 'integer' })
  permissionsVersion: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
