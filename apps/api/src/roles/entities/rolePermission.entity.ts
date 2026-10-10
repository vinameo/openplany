import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { RoleScope } from '@repo/contracts';

/** One permission granted to one role (composite key, no surrogate id). */
@Entity({ name: 'role_permissions' })
export class RolePermission {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  scope: RoleScope;

  @PrimaryColumn({ name: 'role_key', type: 'varchar', length: 20 })
  roleKey: string;

  @PrimaryColumn({ name: 'permission_key', type: 'varchar', length: 100 })
  permissionKey: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
