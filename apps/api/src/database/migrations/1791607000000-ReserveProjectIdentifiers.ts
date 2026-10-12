import type { MigrationInterface, QueryRunner } from 'typeorm';

// Project detail layout (packages/docs/10-project-detail-layout/3-database-spec.md B2).
// Hand-written: do not regenerate with migration:generate.
//
// A Project ID appears in project URLs, so it must name one project forever:
// unique across every row of a workspace, deleted rows included (RQ D14).
// Project names stay reusable after a delete (name index unchanged).
// The index keeps its name: the repository maps it to PROJECT_IDENTIFIER_TAKEN.
//
// The old partial index allowed a soft-deleted and an active project to share
// a Project ID. Such rows are reported and the migration stops: renaming the
// deleted row would break the reservation this migration exists to keep, and a
// 5-character Project ID leaves no room for a safe automatic suffix.
interface IdentifierConflict {
  workspace_id: string;
  identifier: string;
  rows: number;
}

export class ReserveProjectIdentifiers1791607000000 implements MigrationInterface {
  name = 'ReserveProjectIdentifiers1791607000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    const conflicts = (await queryRunner.query(`
      SELECT workspace_id, identifier, count(*)::int AS rows
      FROM projects
      GROUP BY workspace_id, identifier
      HAVING count(*) > 1
      ORDER BY workspace_id, identifier
    `)) as IdentifierConflict[];
    if (conflicts.length > 0) {
      const list = conflicts
        .map((c) => `workspace ${c.workspace_id} identifier ${c.identifier} (${c.rows} rows)`)
        .join('; ');
      throw new Error(
        `ReserveProjectIdentifiers: ${conflicts.length} Project ID(s) are shared by ` +
          `several projects, counting soft-deleted ones: ${list}. Give each conflicting ` +
          `soft-deleted project a unique identifier, then run the migration again ` +
          `(see packages/docs/10-project-detail-layout/3-database-spec.md B2.3).`,
      );
    }

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
