import {
  ReadOnlyTable,
  ReadOnlyTableSubscriber,
  ReadOnlyTableViolationError,
} from './readOnlyTable.js';
import type {
  EntityMetadata,
  InsertEvent,
  RemoveEvent,
  SoftRemoveEvent,
  UpdateEvent,
} from 'typeorm';

@ReadOnlyTable()
class SampleReadOnlyEntity {}

class SampleRegularEntity {}

function mockEvent(target: unknown, tableName: string) {
  const metadata = {
    target,
    tableName,
    name: 'SampleEntity',
  } as EntityMetadata;
  return { metadata };
}

describe('ReadOnlyTableSubscriber', () => {
  const subscriber = new ReadOnlyTableSubscriber();

  it('rejects insert, update, remove, and softRemove on @ReadOnlyTable() entity', () => {
    const event = mockEvent(SampleReadOnlyEntity, 'project_access_policies');

    expect(() =>
      subscriber.beforeInsert(event as InsertEvent<unknown>),
    ).toThrow(ReadOnlyTableViolationError);
    expect(() =>
      subscriber.beforeInsert(event as InsertEvent<unknown>),
    ).toThrow(
      'project_access_policies is read-only: change it with a migration',
    );

    expect(() =>
      subscriber.beforeUpdate(event as UpdateEvent<unknown>),
    ).toThrow(ReadOnlyTableViolationError);
    expect(() =>
      subscriber.beforeUpdate(event as UpdateEvent<unknown>),
    ).toThrow(
      'project_access_policies is read-only: change it with a migration',
    );

    expect(() =>
      subscriber.beforeRemove(event as RemoveEvent<unknown>),
    ).toThrow(ReadOnlyTableViolationError);
    expect(() =>
      subscriber.beforeRemove(event as RemoveEvent<unknown>),
    ).toThrow(
      'project_access_policies is read-only: change it with a migration',
    );

    expect(() =>
      subscriber.beforeSoftRemove(event as SoftRemoveEvent<unknown>),
    ).toThrow(ReadOnlyTableViolationError);
    expect(() =>
      subscriber.beforeSoftRemove(event as SoftRemoveEvent<unknown>),
    ).toThrow(
      'project_access_policies is read-only: change it with a migration',
    );
  });

  it('permits insert, update, remove, and softRemove on regular entity', () => {
    const event = mockEvent(SampleRegularEntity, 'regular_table');

    expect(() =>
      subscriber.beforeInsert(event as InsertEvent<unknown>),
    ).not.toThrow();
    expect(() =>
      subscriber.beforeUpdate(event as UpdateEvent<unknown>),
    ).not.toThrow();
    expect(() =>
      subscriber.beforeRemove(event as RemoveEvent<unknown>),
    ).not.toThrow();
    expect(() =>
      subscriber.beforeSoftRemove(event as SoftRemoveEvent<unknown>),
    ).not.toThrow();
  });
});
