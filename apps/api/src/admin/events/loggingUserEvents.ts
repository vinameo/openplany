import { Injectable, Logger } from '@nestjs/common';
import {
  type UserCreatedEvent,
  type UserUpdatedEvent,
  UserEvents,
} from './userEvents.js';

@Injectable()
export class LoggingUserEvents extends UserEvents {
  private readonly logger = new Logger('UserEvents');

  created(event: UserCreatedEvent): Promise<void> {
    this.logger.log(
      `user.created userId=${event.userId} actorId=${event.actorId} requestId=${event.requestId}`,
    );
    return Promise.resolve();
  }

  updated(event: UserUpdatedEvent): Promise<void> {
    this.logger.log(
      `user.updated userId=${event.userId} actorId=${event.actorId} fields=${event.fields.join(',')} requestId=${event.requestId}`,
    );
    return Promise.resolve();
  }
}
