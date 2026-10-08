import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkspaceTables1791465600000 implements MigrationInterface {
  name = 'CreateWorkspaceTables1791465600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE workspaces (
        id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        name              varchar(80)   NOT NULL,
        slug              varchar(48)   NOT NULL,
        logo              text,
        owner_id          uuid          NOT NULL REFERENCES users (id),
        created_by_id     uuid          REFERENCES users (id),
        updated_by_id     uuid          REFERENCES users (id),
        organization_size varchar(20)   NOT NULL,
        timezone          varchar(255)  NOT NULL DEFAULT 'UTC',
        background_color  varchar(7)    NOT NULL,
        created_at        timestamptz   NOT NULL DEFAULT now(),
        updated_at        timestamptz   NOT NULL DEFAULT now(),
        deleted_at        timestamptz,
        CONSTRAINT workspaces_slug_key UNIQUE (slug),
        CONSTRAINT workspaces_name_check CHECK (btrim(name) <> ''),
        CONSTRAINT workspaces_slug_check CHECK (
          char_length(slug) BETWEEN 3 AND 48
          AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        ),
        CONSTRAINT workspaces_organization_size_check CHECK (
          organization_size IN ('Just myself', '2-10', '11-50', '51-200', '201-500', '500+')
        ),
        CONSTRAINT workspaces_background_color_check CHECK (background_color ~ '^#[0-9A-F]{6}$')
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_workspaces_owner_id ON workspaces (owner_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_workspaces_created_by_created_at ON workspaces (created_by_id, created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE workspace_members (
        id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid         NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        member_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        role         varchar(20)  NOT NULL DEFAULT 'member',
        is_active    boolean      NOT NULL DEFAULT true,
        created_at   timestamptz  NOT NULL DEFAULT now(),
        updated_at   timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT workspace_members_workspace_member_key UNIQUE (workspace_id, member_id),
        CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'guest'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_workspace_members_member_id_active
        ON workspace_members (member_id) WHERE is_active = true
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX workspace_members_one_owner_key
        ON workspace_members (workspace_id) WHERE role = 'owner'
    `);

    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN last_workspace_id uuid REFERENCES workspaces (id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS last_workspace_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_members`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspaces`);
  }
}

