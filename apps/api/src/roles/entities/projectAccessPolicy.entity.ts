import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ReadOnlyTable } from '../../database/readOnlyTable.js';

@Entity({ name: 'project_access_policies' })
@ReadOnlyTable()
export class ProjectAccessPolicyEntity {
  @PrimaryColumn({ name: 'workspace_role_scope', type: 'varchar', length: 16 })
  workspaceRoleScope!: 'workspace';

  @PrimaryColumn({ name: 'workspace_role', type: 'varchar', length: 20 })
  workspaceRole!: string;

  @Column({
    name: 'implicit_project_role',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  implicitProjectRole!: string | null;

  @Column({ name: 'lowest_assignable_role', type: 'varchar', length: 20 })
  lowestAssignableRole!: string;

  @Column({ name: 'highest_assignable_role', type: 'varchar', length: 20 })
  highestAssignableRole!: string;

  @Column({ name: 'overrides_project_rank', type: 'boolean' })
  overridesProjectRank!: boolean;
}
