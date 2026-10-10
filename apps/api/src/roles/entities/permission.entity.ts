import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { RoleScope } from '@repo/contracts';

@Entity({ name: 'permissions' })
export class Permission {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'varchar', length: 16 })
  scope: RoleScope;

  @Column({ type: 'varchar' })
  label: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
