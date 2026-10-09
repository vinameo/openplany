import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/common/configureApp.js';

export interface E2eApp {
  app: INestApplication<App>;
  dataSource: DataSource;
  reset: () => Promise<void>;
}

/** The real AppModule plus the main.ts setup, which Test.createTestingModule skips. */
export async function createE2eApp(): Promise<E2eApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
  });
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  return {
    app,
    dataSource,
    reset: async () => {
      await dataSource.query(
        'TRUNCATE workspace_member_role_history, workspace_members, workspaces, login_attempts, sessions, users',
      );
    },
  };
}
