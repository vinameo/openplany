import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'production', 'test'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

// Reads the raw value: implicit conversion would turn the string 'false' into true.
const toBoolean = ({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}): unknown => {
  const raw = obj[key];
  return raw === 'true' ? true : raw === 'false' ? false : raw;
};

export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv = 'development';

  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  CORS_ORIGIN: string = 'http://localhost:5173';

  @IsString()
  DATABASE_URL: string;

  @Transform(toBoolean)
  @IsBoolean()
  DB_LOGGING: boolean = false;

  @Transform(toBoolean)
  @IsBoolean()
  DB_MIGRATIONS_RUN: boolean = false;

  @IsString()
  REDIS_URL: string;

  // Keys the HMAC of emails stored in login_attempts.email_hash.
  @IsString()
  @MinLength(32)
  AUTH_HMAC_SECRET: string;

  @Transform(toBoolean)
  @IsBoolean()
  SESSION_COOKIE_SECURE: boolean = true;

  @IsInt()
  @Min(1)
  SESSION_TTL_DAYS: number = 7;

  @IsInt()
  @Min(1)
  SESSION_ABSOLUTE_TTL_DAYS: number = 30;

  // Express 'trust proxy': 'false', 'true', a hop count, or a list of subnets.
  @IsString()
  TRUST_PROXY: string = 'false';
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }

  return validated;
}
