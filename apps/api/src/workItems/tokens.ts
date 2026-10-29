import type { WriteLimit } from '../common/writeLimit.js';

export const WORK_ITEM_CREATE_LIMITER = Symbol('WORK_ITEM_CREATE_LIMITER');

export const WORK_ITEM_CREATE_WRITE_LIMIT: WriteLimit = {
  limiterToken: WORK_ITEM_CREATE_LIMITER,
  bucket: 'work_item_create',
  message: { key: 'workItem:errors.tooManyCreates' },
};
