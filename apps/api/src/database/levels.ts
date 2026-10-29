import { IsNull, type FindOptionsWhere } from 'typeorm';
import type { Level } from '@repo/contracts';

export interface LeveledRow {
  id: string;
  level: Level;
  workspaceId: string | null;
  projectId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export type LevelScope =
  | { level: 'workspace'; workspaceId: string }
  | { level: 'project'; workspaceId: string; projectId: string };

export const LIVE_ROW = { deletedAt: IsNull() } as const;

export function defaultLevelRows<T extends LeveledRow>(): FindOptionsWhere<T> {
  return {
    level: 'default',
    ...LIVE_ROW,
  } as FindOptionsWhere<T>;
}

export function ownWorkspaceLevelRows<T extends LeveledRow>(
  workspaceId: string,
): FindOptionsWhere<T> {
  return {
    level: 'workspace',
    workspaceId,
    ...LIVE_ROW,
  } as FindOptionsWhere<T>;
}

export function ownProjectLevelRows<T extends LeveledRow>(scope: {
  workspaceId: string;
  projectId: string;
}): FindOptionsWhere<T> {
  return {
    level: 'project',
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    ...LIVE_ROW,
  } as FindOptionsWhere<T>;
}

/** Live rows the scope's own level manages (workspace or project). */
export function ownLevelRows<T extends LeveledRow>(
  scope: LevelScope,
): FindOptionsWhere<T> {
  return scope.level === 'workspace'
    ? ownWorkspaceLevelRows<T>(scope.workspaceId)
    : ownProjectLevelRows<T>(scope);
}

/**
 * Live rows a scope sees: defaults, the workspace's own and, for a project
 * scope, the project's own. Each entry is one OR branch of a `where`.
 */
export function visibleLevelRows<T extends LeveledRow>(
  scope: LevelScope,
): FindOptionsWhere<T>[] {
  const where: FindOptionsWhere<T>[] = [
    defaultLevelRows<T>(),
    ownWorkspaceLevelRows<T>(scope.workspaceId),
  ];
  if (scope.level === 'project') {
    where.push(ownProjectLevelRows<T>(scope));
  }
  return where;
}

/** Adds the same conditions to every OR branch of a `where`. */
export function withEach<T>(
  where: FindOptionsWhere<T>[],
  extra: FindOptionsWhere<T>,
): FindOptionsWhere<T>[] {
  return where.map((branch) => ({ ...branch, ...extra }));
}

export const LEVEL_ORDER: Record<Level, number> = {
  default: 0,
  workspace: 1,
  project: 2,
};

/** Compares level (default < workspace < project), then createdAt, then id. */
export function compareLevelThenAge(a: LeveledRow, b: LeveledRow): number {
  const levelDiff = (LEVEL_ORDER[a.level] ?? 99) - (LEVEL_ORDER[b.level] ?? 99);
  if (levelDiff !== 0) return levelDiff;

  const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (timeDiff !== 0) return timeDiff;

  return a.id.localeCompare(b.id);
}
