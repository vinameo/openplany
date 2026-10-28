import type { WriteLimit } from '../projects/access/writeLimit.js';

export const STATE_WRITE_LIMITER = Symbol('STATE_WRITE_LIMITER');

export const STATE_WRITE_LIMIT: WriteLimit = {
  limiterToken: STATE_WRITE_LIMITER,
  bucket: 'state_write',
  message: { key: 'state:errors.tooManyChanges' },
  logEvent: 'state.write.rate_limited',
  logOncePerWindow: true,
};
