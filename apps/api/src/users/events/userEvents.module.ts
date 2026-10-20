import { Module } from '@nestjs/common';
import { LoggingUserEvents } from './loggingUserEvents.js';
import { UserEvents } from './userEvents.js';

@Module({
  providers: [{ provide: UserEvents, useClass: LoggingUserEvents }],
  exports: [UserEvents],
})
export class UserEventsModule {}
