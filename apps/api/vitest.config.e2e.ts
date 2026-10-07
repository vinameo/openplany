import { defineConfig } from 'vitest/config';
import { e2eEnv } from './test/e2eEnv.js';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: e2eEnv(),
    globalSetup: ['./test/e2eGlobalSetup.ts'],
    // Suites share one database and truncate it between tests.
    fileParallelism: false,
  },
});
