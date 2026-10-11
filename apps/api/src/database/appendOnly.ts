import {
  EventSubscriber,
  type EntitySubscriberInterface,
  type RemoveEvent,
  type SoftRemoveEvent,
  type UpdateEvent,
} from 'typeorm';

const appendOnlyEntities = new WeakSet<object>();

/**
 * Marks an entity as an append-only log (history tables, RQ INV-09): rows may
 * be inserted but never updated or deleted through TypeORM.
 */
export function AppendOnly(): ClassDecorator {
  return (target) => {
    appendOnlyEntities.add(target);
  };
}

export class AppendOnlyViolationError extends Error {
  constructor(entity: string, operation: string) {
    super(`${entity} is append-only; ${operation} is not allowed`);
    this.name = 'AppendOnlyViolationError';
  }
}

/**
 * Rejects update/delete/soft-delete on @AppendOnly() entities, whether they
 * come from save(), update(), delete() or a QueryBuilder. Database-level
 * cascades (e.g. hard-deleting a workspace) are unaffected.
 */
@EventSubscriber()
export class AppendOnlySubscriber implements EntitySubscriberInterface {
  beforeUpdate(event: UpdateEvent<unknown>): void {
    guard(event.metadata.target, event.metadata.name, 'update');
  }

  beforeRemove(event: RemoveEvent<unknown>): void {
    guard(event.metadata.target, event.metadata.name, 'delete');
  }

  beforeSoftRemove(event: SoftRemoveEvent<unknown>): void {
    guard(event.metadata.target, event.metadata.name, 'soft delete');
  }
}

function guard(target: unknown, name: string, operation: string): void {
  if (typeof target === 'function' && appendOnlyEntities.has(target)) {
    throw new AppendOnlyViolationError(name, operation);
  }
}
