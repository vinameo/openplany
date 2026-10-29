import {
  IsNull,
  type EntityManager,
  type FindOptionsWhere,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';
import { Project } from '../projects/entities/project.entity.js';
import { WorkItem } from '../workItems/entities/workItem.entity.js';
import type { WorkItemState } from './entities/workItemState.entity.js';
import type { StateScope } from './stateCatalog.js';

export const LIVE_STATE = { deletedAt: IsNull() } as const;

export const DEFAULT_STATES: FindOptionsWhere<WorkItemState> = {
  level: 'default',
  ...LIVE_STATE,
};

export function ownWorkspaceStates(
  workspaceId: string,
): FindOptionsWhere<WorkItemState> {
  return {
    level: 'workspace',
    workspaceId,
    ...LIVE_STATE,
  };
}

/** Live project-level states of every project in a workspace. */
export function projectStatesOf(
  workspaceId: string,
): FindOptionsWhere<WorkItemState> {
  return {
    level: 'project',
    workspaceId,
    ...LIVE_STATE,
  };
}

export function ownProjectStates(scope: {
  workspaceId: string;
  projectId: string;
}): FindOptionsWhere<WorkItemState> {
  return { ...projectStatesOf(scope.workspaceId), projectId: scope.projectId };
}

/** Live states the scope's own level manages (workspace or project). */
export function ownStates(scope: StateScope): FindOptionsWhere<WorkItemState> {
  return scope.level === 'workspace'
    ? ownWorkspaceStates(scope.workspaceId)
    : ownProjectStates(scope);
}

/**
 * Live states a scope sees: defaults, the workspace's own and, for a project
 * scope, the project's own. Each entry is one OR branch of a `where`.
 */
export function visibleStates(
  scope: StateScope,
): FindOptionsWhere<WorkItemState>[] {
  const where = [DEFAULT_STATES, ownWorkspaceStates(scope.workspaceId)];
  if (scope.level === 'project') {
    where.push(ownProjectStates(scope));
  }
  return where;
}

/** Subquery of the ids of live projects in a workspace, for `IN (...)` filters. */
export function liveProjectIdsOf(
  parent: SelectQueryBuilder<ObjectLiteral>,
  workspaceId: string,
): string {
  return parent
    .subQuery()
    .select('p.id')
    .from(Project, 'p')
    .where('p.workspaceId = :liveProjectsWorkspaceId', {
      liveProjectsWorkspaceId: workspaceId,
    })
    .andWhere('p.deletedAt IS NULL')
    .getQuery();
}

/**
 * Live work items (alias `wi`) of live projects in the scope's workspace,
 * narrowed to the project for a project scope. The one filter behind both the
 * counts shown and the items a state delete moves (DB B2.6, SR-8).
 */
export function liveWorkItemsIn(
  manager: EntityManager,
  scope: StateScope,
): SelectQueryBuilder<WorkItem> {
  const qb = manager
    .createQueryBuilder(WorkItem, 'wi')
    .where('wi.workspaceId = :workspaceId', {
      workspaceId: scope.workspaceId,
    })
    .andWhere('wi.deletedAt IS NULL')
    .andWhere(
      (sub) => `wi.projectId IN ${liveProjectIdsOf(sub, scope.workspaceId)}`,
    );
  if (scope.level === 'project') {
    qb.andWhere('wi.projectId = :projectId', { projectId: scope.projectId });
  }
  return qb;
}
