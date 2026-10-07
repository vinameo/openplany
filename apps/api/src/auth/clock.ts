import { Injectable } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';

/** Time source; swapped in tests so windows and delays are deterministic. */
export abstract class Clock {
  abstract now(): Date;
  abstract sleep(ms: number): Promise<void>;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }

  async sleep(ms: number): Promise<void> {
    await sleep(ms);
  }
}
