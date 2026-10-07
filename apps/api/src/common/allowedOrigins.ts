import { ConfigService } from '@nestjs/config';

export function getAllowedOrigins(config: ConfigService): string[] {
  return config
    .getOrThrow<string>('CORS_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}
