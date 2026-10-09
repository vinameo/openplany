import { Injectable, Logger } from '@nestjs/common';
import { type UserCreatedEvent, UserEvents } from './userEvents.js';

@Injectable()
export class LoggingUserEvents extends UserEvents {
  private readonly logger = new Logger('UserEvents');

  created(event: UserCreatedEvent): Promise<void> {
    this.logger.log(
      `user.created userId=${event.userId} actorId=${event.actorId} requestId=${event.requestId}`,
    );
    return Promise.resolve();
  }
}

