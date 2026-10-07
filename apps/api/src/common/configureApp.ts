import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { getAllowedOrigins } from './allowedOrigins.js';
import { ApiExceptionFilter } from './apiExceptionFilter.js';
import { requestIdMiddleware } from './requestId.middleware.js';
import { createValidationPipe } from './validation.js';

/** Parses TRUST_PROXY into the value Express' 'trust proxy' setting expects. */
export function parseTrustProxy(raw: string): boolean | number | string {
  if (raw === 'true') return true;
  if (raw === 'false' || raw === '') return false;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

/**
 * Global HTTP setup shared by main.ts and the e2e tests, which do not run
 * main.ts (see CLAUDE.md, Testing).
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const expressApp = app as NestExpressApplication;

  expressApp.set(
    'trust proxy',
    parseTrustProxy(config.getOrThrow<string>('TRUST_PROXY')),
  );
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: getAllowedOrigins(config),
    credentials: true,
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
}
