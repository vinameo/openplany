import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import type { EnvironmentVariables } from '../config/env.validation.js';

type DatabaseEnv = Pick<
  EnvironmentVariables,
  'DATABASE_URL' | 'DB_LOGGING' | 'DB_MIGRATIONS_RUN'
>;

// Shared by the Nest TypeOrmModule and the TypeORM CLI data source.
// Globs point at compiled .js files, so migrations always run from dist/.
export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    entities: [join(import.meta.dirname, '../**/*.entity.js')],
    migrations: [join(import.meta.dirname, 'migrations/*.js')],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: env.DB_MIGRATIONS_RUN,
    logging: env.DB_LOGGING,
    // Schema changes ship as migrations only — never synchronize.
    synchronize: false,
  };
}
