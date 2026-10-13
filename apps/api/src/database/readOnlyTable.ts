import {
  EventSubscriber,
  type EntitySubscriberInterface,
  type InsertEvent,
  type RemoveEvent,
  type SoftRemoveEvent,
  type UpdateEvent,
} from 'typeorm';

const readOnlyEntities = new WeakSet<object>();

/**
 * Marks an entity as a read-only table (DB B5.1, RQ INV-02): rows may
 * be queried but never inserted, updated, deleted, or soft-deleted through TypeORM.
 * All modifications must go through database migrations.
 */
export function ReadOnlyTable(): ClassDecorator {
  return (target) => {
    readOnlyEntities.add(target);
  };
}

export class ReadOnlyTableViolationError extends Error {
  constructor(tableOrEntity: string) {
    super(`${tableOrEntity} is read-only: change it with a migration`);
    this.name = 'ReadOnlyTableViolationError';
  }
}

/**
 * Rejects insert/update/delete/soft-delete on @ReadOnlyTable() entities.
 */
@EventSubscriber()
export class ReadOnlyTableSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<unknown>): void {
    guard(
      event.metadata.target,
      event.metadata.tableName || event.metadata.name,
    );
  }

  beforeUpdate(event: UpdateEvent<unknown>): void {
    guard(
      event.metadata.target,
      event.metadata.tableName || event.metadata.name,
    );
  }

  beforeRemove(event: RemoveEvent<unknown>): void {
    guard(
      event.metadata.target,
      event.metadata.tableName || event.metadata.name,
    );
  }

  beforeSoftRemove(event: SoftRemoveEvent<unknown>): void {
    guard(
      event.metadata.target,
      event.metadata.tableName || event.metadata.name,
    );
  }
}

function guard(target: unknown, tableOrEntity: string): void {
  if (typeof target === 'function' && readOnlyEntities.has(target)) {
    throw new ReadOnlyTableViolationError(tableOrEntity);
  }
}
