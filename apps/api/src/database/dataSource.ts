import 'dotenv/config';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { buildDataSourceOptions } from './dataSourceOptions.js';

// Entry point for the TypeORM CLI (migration:generate / run / revert).
export const AppDataSource = new DataSource(
  buildDataSourceOptions(validateEnv(process.env)),
);
