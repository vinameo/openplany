import type { MigrationInterface, QueryRunner } from 'typeorm';

export const MIGRATION_PROJECT_ROLE_RANK: Record<string, number> = {
  admin: 40,
  contributor: 30,
  commenter: 20,
  viewer: 10,
};

// Merge role workspace and project feature (packages/docs/13-merge-role-workspace-project/3-database-spec.md B4).
// Hand-written migration: do not regenerate with migration:generate (B0).
// UPGRADE NOTE (R-01): Stop all API instances, run migrations, then start API instances.
export class ApplyProjectAccessPolicies1791610200000 implements MigrationInterface {
  name = 'ApplyProjectAccessPolicies1791610200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(`
      CREATE TEMP TABLE _rank (role varchar(20) PRIMARY KEY, rank int) ON COMMIT DROP;
      INSERT INTO _rank VALUES ('admin', 40), ('contributor', 30), ('commenter', 20), ('viewer', 10);
    `);

    await queryRunner.query(`
      CREATE TEMP TABLE _apply ON COMMIT DROP AS
      SELECT pm.id, pm.workspace_id, pm.project_id, pm.member_id, pm.role AS from_role,
             CASE
               -- vai trò (cuối cùng) có ngầm định → tắt dòng, kể cả người đã rời workspace (R-DB4)
               WHEN p.implicit_project_role IS NOT NULL THEN NULL
               -- người đã rời với vai trò không ngầm định: không đụng (PM FC-02 lo khi có xoá thành viên)
               WHEN NOT wm.is_active THEN pm.role
               WHEN r.rank > hi.rank THEN p.highest_assignable_role
               WHEN r.rank < lo.rank THEN p.lowest_assignable_role
               ELSE pm.role
             END AS to_role
      FROM project_members pm
      JOIN workspace_members wm ON wm.workspace_id = pm.workspace_id AND wm.member_id = pm.member_id
      JOIN project_access_policies p ON p.workspace_role = wm.role
      JOIN _rank r  ON r.role  = pm.role
      JOIN _rank lo ON lo.role = p.lowest_assignable_role
      JOIN _rank hi ON hi.role = p.highest_assignable_role
      WHERE pm.is_active;

      DELETE FROM _apply WHERE to_role IS NOT DISTINCT FROM from_role;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        ended_count integer;
        moved_count integer;
      BEGIN
        SELECT count(*) INTO ended_count FROM _apply WHERE to_role IS NULL;
        SELECT count(*) INTO moved_count FROM _apply WHERE to_role IS NOT NULL;
        RAISE NOTICE 'ApplyProjectAccessPolicies: ended % memberships of roles with implicit access; moved % roles into range', ended_count, moved_count;
      END $$;
    `);

    await queryRunner.query(`
      UPDATE project_members pm
      SET is_active = (a.to_role IS NOT NULL),
          role      = COALESCE(a.to_role, pm.role),
          updated_at = now()
      FROM _apply a WHERE pm.id = a.id;
    `);

    await queryRunner.query(`
      INSERT INTO project_member_role_history
        (workspace_id, project_id, member_id, role_scope, from_role, to_role, change_type, actor_id, request_id, created_at)
      SELECT workspace_id, project_id, member_id, 'project', from_role, to_role,
             'workspace_role_applied', NULL, 'migration:ApplyProjectAccessPolicies', now()
      FROM _apply;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const rows = (await queryRunner.query(
      `SELECT count(*) AS count FROM project_member_role_history WHERE change_type = 'workspace_role_applied' AND request_id IS DISTINCT FROM 'migration:ApplyProjectAccessPolicies'`,
    )) as { count: string | number }[];
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) {
      throw new Error(
        `Cannot revert ApplyProjectAccessPolicies: ${count} later role changes depend on it.`,
      );
    }

    await queryRunner.query(`
      UPDATE project_members pm
      SET role = h.from_role, is_active = true, updated_at = now()
      FROM project_member_role_history h
      WHERE h.request_id = 'migration:ApplyProjectAccessPolicies'
        AND h.change_type = 'workspace_role_applied'
        AND pm.project_id = h.project_id AND pm.member_id = h.member_id
    `);

    await queryRunner.query(`
      DELETE FROM project_member_role_history
      WHERE request_id = 'migration:ApplyProjectAccessPolicies' AND change_type = 'workspace_role_applied'
    `);
  }
}
