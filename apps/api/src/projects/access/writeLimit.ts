import type { Type } from '@nestjs/common';
import type { MessageRef } from '@repo/contracts';

export const WRITE_LIMIT_KEY = 'write_limit';

export type LimiterToken = string | symbol | Function | Type<unknown>;

export interface WriteLimit {
  limiterToken: LimiterToken;
  bucket: string;
  message: MessageRef;
}
