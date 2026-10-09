import type { MigrationInterface, QueryRunner } from 'typeorm';

// Roles and permissions feature (packages/docs/6-roles-and-permissions/3-database-spec.md B2).
// Workspace member role history table with shape check and backfill.
export class CreateWorkspaceMemberRoleHistory1791550147414 implements MigrationInterface {
  name = 'CreateWorkspaceMemberRoleHistory1791550147414';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(`
      CREATE TABLE workspace_member_role_history (
        id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  uuid          NOT NULL
                      CONSTRAINT wmrh_workspace_id_fkey REFERENCES workspaces (id) ON DELETE CASCADE,
        member_id     uuid          NOT NULL
                      CONSTRAINT wmrh_member_id_fkey REFERENCES users (id),
        from_role     varchar(20),
        to_role       varchar(20),
        change_type   varchar(30)   NOT NULL,
        actor_id      uuid
                      CONSTRAINT wmrh_actor_id_fkey REFERENCES users (id) ON DELETE SET NULL,
        request_id    varchar(128),
        created_at    timestamptz   NOT NULL DEFAULT now(),

        CONSTRAINT wmrh_from_role_check CHECK (from_role IS NULL OR from_role IN ('owner', 'admin', 'member', 'guest')),
        CONSTRAINT wmrh_to_role_check   CHECK (to_role   IS NULL OR to_role   IN ('owner', 'admin', 'member', 'guest')),
        CONSTRAINT wmrh_change_check    CHECK (from_role IS DISTINCT FROM to_role),
        CONSTRAINT wmrh_change_type_check CHECK (change_type IN (
          'workspace_created', 'member_added', 'role_changed',
          'ownership_transferred', 'member_removed', 'backfill'
        )),
        CONSTRAINT wmrh_shape_check CHECK (
          CASE change_type
            WHEN 'workspace_created'     THEN from_role IS NULL AND to_role = 'owner'
            WHEN 'member_added'          THEN from_role IS NULL AND to_role <> 'owner'
            WHEN 'backfill'              THEN from_role IS NULL AND to_role IS NOT NULL
            WHEN 'role_changed'          THEN from_role IS NOT NULL AND to_role IS NOT NULL
                                              AND from_role <> 'owner' AND to_role <> 'owner'
            WHEN 'ownership_transferred' THEN from_role IS NOT NULL AND to_role IS NOT NULL
                                              AND (from_role = 'owner' OR to_role = 'owner')
            WHEN 'member_removed'        THEN from_role IS NOT NULL AND from_role <> 'owner' AND to_role IS NULL
            ELSE false
          END
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wmrh_workspace_created_at
        ON workspace_member_role_history (workspace_id, created_at DESC, id DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wmrh_workspace_member_created_at
        ON workspace_member_role_history (workspace_id, member_id, created_at DESC)
    `);

    await queryRunner.query(`
      INSERT INTO workspace_member_role_history
        (workspace_id, member_id, from_role, to_role, change_type, actor_id, request_id, created_at)
      SELECT workspace_id, member_id, NULL, role, 'backfill', NULL, NULL, created_at
      FROM workspace_members
      WHERE is_active
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_member_role_history`);
  }
}
