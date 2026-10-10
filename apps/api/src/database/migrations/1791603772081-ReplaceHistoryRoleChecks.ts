import type { MigrationInterface, QueryRunner } from 'typeorm';

// Roles and permissions feature (packages/docs/6-roles-and-permissions/3-database-spec.md B14).
// The history table no longer lists role names in CHECK constraints: a new row's
// from_role/to_role must exist in `roles` at insert time (trigger), while old rows
// keep the role they recorded (e.g. the retired 'owner').
export class ReplaceHistoryRoleChecks1791603772081 implements MigrationInterface {
  name = 'ReplaceHistoryRoleChecks1791603772081';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // 1. Drop the hard-coded role lists; the shape check keeps only NULL rules.
    await queryRunner.query(`
      ALTER TABLE workspace_member_role_history DROP CONSTRAINT wmrh_from_role_check;
      ALTER TABLE workspace_member_role_history DROP CONSTRAINT wmrh_to_role_check;
      ALTER TABLE workspace_member_role_history DROP CONSTRAINT wmrh_shape_check;
      ALTER TABLE workspace_member_role_history ADD CONSTRAINT wmrh_shape_check CHECK (
        CASE change_type
          WHEN 'workspace_created'     THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'member_added'          THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'backfill'              THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'role_changed'          THEN from_role IS NOT NULL AND to_role IS NOT NULL
          WHEN 'member_removed'        THEN from_role IS NOT NULL AND to_role IS NULL
          WHEN 'ownership_transferred' THEN from_role IS NOT NULL AND to_role IS NOT NULL
          WHEN 'owner_role_retired'    THEN from_role IS NOT NULL AND to_role IS NOT NULL
          ELSE false
        END
      );
    `);

    // 2. New rows: roles must exist in \`roles\`; legacy change types are closed.
    //    Errors mimic a CHECK violation (23514 + constraint name) so callers and
    //    tests handle them exactly like the constraints they replace.
    await queryRunner.query(`
      CREATE FUNCTION wmrh_validate_row() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.change_type IN ('ownership_transferred', 'owner_role_retired') THEN
          RAISE EXCEPTION 'new row for relation "%" violates check constraint "%"',
            TG_TABLE_NAME, 'wmrh_legacy_change_type_check'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'wmrh_legacy_change_type_check',
                  DETAIL = format('change_type %s exists only in rows written before the owner role was retired', NEW.change_type);
        END IF;
        IF NEW.from_role IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM roles WHERE scope = 'workspace' AND key = NEW.from_role
        ) THEN
          RAISE EXCEPTION 'new row for relation "%" violates check constraint "%"',
            TG_TABLE_NAME, 'wmrh_from_role_check'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'wmrh_from_role_check',
                  DETAIL = format('from_role %s is not a workspace role', NEW.from_role);
        END IF;
        IF NEW.to_role IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM roles WHERE scope = 'workspace' AND key = NEW.to_role
        ) THEN
          RAISE EXCEPTION 'new row for relation "%" violates check constraint "%"',
            TG_TABLE_NAME, 'wmrh_to_role_check'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'wmrh_to_role_check',
                  DETAIL = format('to_role %s is not a workspace role', NEW.to_role);
        END IF;
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER wmrh_validate_row
        BEFORE INSERT OR UPDATE OF from_role, to_role, change_type
        ON workspace_member_role_history
        FOR EACH ROW EXECUTE FUNCTION wmrh_validate_row();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);

    // Restores the B13 constraints. NOT VALID: rows written after `up` may hold
    // roles outside the old list (same approach as RemoveWorkspaceOwnerRole.down).
    await queryRunner.query(`
      DROP TRIGGER wmrh_validate_row ON workspace_member_role_history;
      DROP FUNCTION wmrh_validate_row();

      ALTER TABLE workspace_member_role_history DROP CONSTRAINT wmrh_shape_check;
      ALTER TABLE workspace_member_role_history ADD CONSTRAINT wmrh_shape_check CHECK (
        CASE change_type
          WHEN 'workspace_created'     THEN from_role IS NULL AND to_role IN ('admin', 'owner')
          WHEN 'member_added'          THEN from_role IS NULL AND to_role IS NOT NULL AND to_role <> 'owner'
          WHEN 'backfill'              THEN from_role IS NULL AND to_role IS NOT NULL
          WHEN 'role_changed'          THEN from_role IS NOT NULL AND to_role IS NOT NULL
                                            AND from_role <> 'owner' AND to_role <> 'owner'
          WHEN 'ownership_transferred' THEN from_role IS NOT NULL AND to_role IS NOT NULL
                                            AND (from_role = 'owner' OR to_role = 'owner')
          WHEN 'member_removed'        THEN from_role IS NOT NULL AND from_role <> 'owner' AND to_role IS NULL
          WHEN 'owner_role_retired'    THEN from_role = 'owner' AND to_role = 'admin'
          ELSE false
        END
      ) NOT VALID;
      ALTER TABLE workspace_member_role_history ADD CONSTRAINT wmrh_from_role_check
        CHECK (from_role IS NULL OR from_role IN ('owner', 'admin', 'member', 'guest')) NOT VALID;
      ALTER TABLE workspace_member_role_history ADD CONSTRAINT wmrh_to_role_check
        CHECK (to_role IS NULL OR to_role IN ('owner', 'admin', 'member', 'guest')) NOT VALID;
    `);
  }
}
