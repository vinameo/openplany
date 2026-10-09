export interface UserCreatedEvent {
  userId: string;
  actorId: string;
  occurredAt: Date;
  requestId: string;
}

export abstract class UserEvents {
  abstract created(event: UserCreatedEvent): Promise<void>;
}

