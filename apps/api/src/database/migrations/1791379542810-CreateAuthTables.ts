import type { MigrationInterface, QueryRunner } from 'typeorm';

// Login feature schema: packages/docs/1-login-page/database-spec.md, adapted
// for plain PostgreSQL (D1): an expression index on lower(email) replaces the
// email_lower generated column, and indexes are created inline because the
// tables are new and empty. The legacy users.token columns are not created;
// sessions replace them (R2). password_reset_tokens ships with that flow.
export class CreateAuthTables1791379542810 implements MigrationInterface {
  name = 'CreateAuthTables1791379542810';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        password                    varchar(255)  NOT NULL,
        username                    varchar(128)  NOT NULL,
        email                       varchar(255),
        mobile_number               varchar(255),
        first_name                  varchar(255)  DEFAULT '',
        last_name                   varchar(255)  DEFAULT '',
        display_name                varchar(255)  DEFAULT '',
        avatar                      text,
        avatar_asset_id             uuid,
        cover_image                 varchar(800),
        cover_image_asset_id        uuid,
        date_joined                 timestamptz   NOT NULL DEFAULT now(),
        created_at                  timestamptz   NOT NULL DEFAULT now(),
        updated_at                  timestamptz   NOT NULL DEFAULT now(),
        last_login                  timestamptz,
        last_login_time             timestamptz,
        last_logout_time            timestamptz,
        last_active                 timestamptz,
        last_login_ip               varchar(45),
        last_logout_ip              varchar(45),
        last_login_medium           varchar(20),
        last_login_uagent           text,
        last_location               varchar(255),
        created_location            varchar(255),
        user_timezone               varchar(255)  NOT NULL DEFAULT 'UTC',
        is_active                   boolean       NOT NULL DEFAULT true,
        is_bot                      boolean       NOT NULL DEFAULT false,
        bot_type                    varchar(30),
        masked_at                   timestamptz,
        is_managed                  boolean       NOT NULL DEFAULT false,
        is_password_autoset         boolean       NOT NULL DEFAULT false,
        is_password_expired         boolean       NOT NULL DEFAULT false,
        is_password_reset_required  boolean       NOT NULL DEFAULT false,
        is_email_verified           boolean       NOT NULL DEFAULT false,
        is_email_valid              boolean       NOT NULL DEFAULT false,
        is_superuser                boolean       NOT NULL DEFAULT false,
        is_staff                    boolean       NOT NULL DEFAULT false,
        CONSTRAINT users_username_key UNIQUE (username),
        CONSTRAINT users_last_login_medium_check CHECK (
          last_login_medium IS NULL OR last_login_medium IN
            ('email', 'magic-code', 'google', 'github', 'gitlab', 'oidc', 'saml')
        )
      )
    `);
    // Case-insensitive uniqueness (Q3). Lookups must use lower(email) to hit it.
    await queryRunner.query(
      `CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email))`,
    );

    await queryRunner.query(`
      CREATE TABLE sessions (
        id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        uuid          NOT NULL REFERENCES users (id),
        token_hash     varchar(64)   NOT NULL,
        login_medium   varchar(20)   NOT NULL,
        ip             varchar(45),
        user_agent     varchar(512),
        created_at     timestamptz   NOT NULL DEFAULT now(),
        last_used_at   timestamptz   NOT NULL DEFAULT now(),
        expires_at     timestamptz   NOT NULL,
        revoked_at     timestamptz,
        is_reset_only  boolean       NOT NULL DEFAULT false,
        CONSTRAINT sessions_token_hash_key UNIQUE (token_hash),
        CONSTRAINT sessions_login_medium_check CHECK (
          login_medium IN ('email', 'magic-code', 'google', 'github', 'gitlab', 'oidc', 'saml')
        ),
        CONSTRAINT sessions_expires_after_created_check CHECK (expires_at > created_at)
      )
    `);
    // Live sessions per user ("sign out everywhere"); also covers the FK.
    await queryRunner.query(
      `CREATE INDEX idx_sessions_user_id_live ON sessions (user_id) WHERE revoked_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_sessions_expires_at ON sessions (expires_at)`,
    );

    // Append-only; user_id deliberately has no FK (database-spec 4.3).
    await queryRunner.query(`
      CREATE TABLE login_attempts (
        id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid,
        email_hash  varchar(64)   NOT NULL,
        ip          varchar(45)   NOT NULL,
        user_agent  varchar(512),
        medium      varchar(20)   NOT NULL DEFAULT 'email',
        result      varchar(20)   NOT NULL,
        reason      varchar(30),
        created_at  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT login_attempts_result_check CHECK (result IN ('success', 'failure', 'blocked')),
        CONSTRAINT login_attempts_reason_check CHECK (reason IS NULL OR reason IN (
          'unknown_email', 'masked', 'bot', 'password_not_set', 'wrong_password',
          'inactive', 'managed_sso', 'not_superuser', 'rate_limited', 'reset_required'
        ))
      )
    `);
    // Rate limiting counts failures only (api-spec 6.2). The predicates match
    // the limiter's queries exactly, so the planner can use these partial indexes.
    await queryRunner.query(
      `CREATE INDEX idx_la_ip_failures ON login_attempts (ip, created_at) WHERE result = 'failure'`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_la_email_ip_failures ON login_attempts (email_hash, ip, created_at) WHERE result = 'failure'`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_la_created_at ON login_attempts (created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS login_attempts`);
    await queryRunner.query(`DROP TABLE IF EXISTS sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
