import type { MigrationInterface, QueryRunner } from 'typeorm';

// Create project feature, review follow-up (packages/docs/9-create-project/3-database-spec.md B2.4).
// Hand-written: do not regenerate with migration:generate (DB-F1).
//
// 1. Every foreign key column that a parent delete/update has to search gets a
//    full index. The partial indexes (WHERE deleted_at IS NULL / WHERE is_active)
//    cannot serve the FK trigger lookups, which have no such predicate, so a
//    cascade or SET NULL would scan the whole table under lock.
// 2. History rows point at their project through (project_id, workspace_id),
//    like project_members, so a row can never name a workspace that is not
//    its project's workspace.
export class AddProjectForeignKeyIndexes1791606000000 implements MigrationInterface {
  name = 'AddProjectForeignKeyIndexes1791606000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(`
      CREATE INDEX idx_projects_workspace_id ON projects (workspace_id);
      CREATE INDEX idx_projects_created_by_id ON projects (created_by_id);
      CREATE INDEX idx_projects_updated_by_id ON projects (updated_by_id);
    `);

    // A full index serves both the active-membership reads and the FK lookups.
    await queryRunner.query(`
      DROP INDEX idx_project_members_workspace_member_active;
      CREATE INDEX idx_project_members_workspace_member ON project_members (workspace_id, member_id);
      CREATE INDEX idx_project_members_created_by_id ON project_members (created_by_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_pmrh_workspace_id ON project_member_role_history (workspace_id);
      CREATE INDEX idx_pmrh_member_id ON project_member_role_history (member_id);
      CREATE INDEX idx_pmrh_actor_id ON project_member_role_history (actor_id);
    `);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_project_id_fkey;
      ALTER TABLE project_member_role_history
        ADD CONSTRAINT pmrh_project_fkey
        FOREIGN KEY (project_id, workspace_id) REFERENCES projects (id, workspace_id) ON DELETE CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    await queryRunner.query(`
      ALTER TABLE project_member_role_history DROP CONSTRAINT pmrh_project_fkey;
      ALTER TABLE project_member_role_history
        ADD CONSTRAINT pmrh_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      DROP INDEX idx_pmrh_actor_id;
      DROP INDEX idx_pmrh_member_id;
      DROP INDEX idx_pmrh_workspace_id;
      DROP INDEX idx_project_members_created_by_id;
      DROP INDEX idx_project_members_workspace_member;
      CREATE INDEX idx_project_members_workspace_member_active
        ON project_members (workspace_id, member_id) WHERE is_active;
      DROP INDEX idx_projects_updated_by_id;
      DROP INDEX idx_projects_created_by_id;
      DROP INDEX idx_projects_workspace_id;
    `);
  }
}
