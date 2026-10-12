import type { MigrationInterface, QueryRunner } from 'typeorm';

// Project detail layout (packages/docs/10-project-detail-layout/3-database-spec.md B2).
// Hand-written: do not regenerate with migration:generate.
//
// A Project ID appears in project URLs, so it must name one project forever:
// unique across every row of a workspace, deleted rows included (RQ D14).
// Project names stay reusable after a delete (name index unchanged).
// The index keeps its name: the repository maps it to PROJECT_IDENTIFIER_TAKEN.
export class ReserveProjectIdentifiers1791607000000 implements MigrationInterface {
  name = 'ReserveProjectIdentifiers1791607000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      DROP INDEX projects_workspace_identifier_key;
      CREATE UNIQUE INDEX projects_workspace_identifier_key
        ON projects (workspace_id, identifier);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`
      DROP INDEX projects_workspace_identifier_key;
      CREATE UNIQUE INDEX projects_workspace_identifier_key
        ON projects (workspace_id, identifier) WHERE deleted_at IS NULL;
    `);
  }
}
