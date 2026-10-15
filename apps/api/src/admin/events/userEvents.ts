export interface UserCreatedEvent {
  userId: string;
  actorId: string;
  occurredAt: Date;
  requestId: string;
}

export interface UserUpdatedEvent {
  userId: string;
  actorId: string;
  fields: string[];
  occurredAt: Date;
  requestId: string;
}

export abstract class UserEvents {
  abstract created(event: UserCreatedEvent): Promise<void>;
  abstract updated(event: UserUpdatedEvent): Promise<void>;
}
