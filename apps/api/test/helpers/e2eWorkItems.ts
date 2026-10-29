import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

export interface SqlQueryRunner {
  query: <T = unknown>(sql: string, parameters?: unknown[]) => Promise<T>;
}

export interface InsertWorkItemOptions {
  id?: string;
  workspaceId: string;
  projectId: string;
  number?: number;
  title?: string;
  description?: string;
  stateId?: string | null;
  priorityId?: string | null;
  idempotencyKey?: string;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  deletedAt?: Date | string | null;
}

export type InsertedWorkItem = [{ id: string }] & { id: string };

/**
 * Inserts a work item directly into the database.
 * Auto-resolves stateId (defaulting to 'backlog') and priorityId (defaulting to 'none')
 * when the respective columns exist and values are omitted.
 */
export async function insertWorkItem(
  ds: SqlQueryRunner,
  options: InsertWorkItemOptions,
): Promise<InsertedWorkItem> {
  const id = options.id ?? randomUUID();
  const number = options.number ?? 1;
  const title = options.title ?? 'Work item';
  const description = options.description ?? '';
  const idempotencyKey = options.idempotencyKey ?? randomUUID();
  const createdById = options.createdById ?? null;
  const updatedById = options.updatedById ?? null;
  const createdAt = options.createdAt ?? new Date();
  const updatedAt = options.updatedAt ?? options.createdAt ?? new Date();
  const deletedAt = options.deletedAt ?? null;

  // Inspect existing columns on work_items table
  const cols = await ds.query<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'work_items'`,
  );
  const colNames = new Set(cols.map((c) => c.column_name));

  let resolvedStateId: string | null = null;
  if (colNames.has('state_id')) {
    if (options.stateId !== undefined) {
      resolvedStateId = options.stateId;
    } else {
      const defaultStates = await ds.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'backlog' LIMIT 1`,
      );
      resolvedStateId = defaultStates[0]?.id ?? null;
    }
  }

  let resolvedPriorityId: string | null = null;
  if (colNames.has('priority_id')) {
    if (options.priorityId !== undefined) {
      resolvedPriorityId = options.priorityId;
    } else {
      const defaultPriorities = await ds.query<{ id: string }[]>(
        `SELECT id FROM work_item_priorities WHERE default_key = 'none' LIMIT 1`,
      );
      resolvedPriorityId = defaultPriorities[0]?.id ?? null;
    }
  }

  const insertCols: string[] = [
    'id',
    'workspace_id',
    'project_id',
    'number',
    'title',
    'description',
    'idempotency_key',
    'created_by_id',
    'updated_by_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ];
  const values: unknown[] = [
    id,
    options.workspaceId,
    options.projectId,
    number,
    title,
    description,
    idempotencyKey,
    createdById,
    updatedById,
    createdAt,
    updatedAt,
    deletedAt,
  ];

  if (colNames.has('state_id')) {
    insertCols.push('state_id');
    values.push(resolvedStateId);
  }

  if (colNames.has('priority_id')) {
    insertCols.push('priority_id');
    values.push(resolvedPriorityId);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await ds.query<{ id: string }[]>(
    `INSERT INTO work_items (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values,
  );

  const row = rows[0]!;
  const result = [row] as unknown as InsertedWorkItem;
  result.id = row.id;
  return result;
}

/**
 * Reverts migrations one by one until targetMigrationName has just been reverted.
 * Throws if the migration is not found among applied migrations.
 */
export async function undoUntil(
  ds: DataSource,
  targetMigrationName: string,
): Promise<void> {
  const maxIterations = 50;
  for (let i = 0; i < maxIterations; i++) {
    const rows = await ds.query<{ name: string }[]>(
      'SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1',
    );
    if (rows.length === 0) {
      throw new Error(
        `Cannot undo until "${targetMigrationName}": no applied migrations found in typeorm_migrations.`,
      );
    }
    const current = rows[0].name;
    await ds.undoLastMigration({ transaction: 'each' });
    if (
      current === targetMigrationName ||
      current.startsWith(targetMigrationName) ||
      current.includes(targetMigrationName)
    ) {
      return;
    }
  }
  throw new Error(
    `Exceeded ${maxIterations} rollbacks while searching for migration "${targetMigrationName}".`,
  );
}
