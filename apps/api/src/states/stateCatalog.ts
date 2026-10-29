import { Injectable } from '@nestjs/common';
import { Not, type EntityManager, type FindOptionsWhere } from 'typeorm';
import {
  PROJECT_STATES_MAX,
  STATE_GROUPS,
  WORKSPACE_STATES_MAX,
} from '@repo/contracts';
import { equalsLowercase } from '../database/findOperators.js';
import { WorkItemState } from './entities/workItemState.entity.js';
import {
  liveProjectIdsOf,
  liveWorkItemsIn,
  ownStates,
  projectStatesOf,
  visibleStates,
} from './stateFilters.js';

export type StateScope =
  | { level: 'workspace'; workspaceId: string }
  | { level: 'project'; workspaceId: string; projectId: string };

/** How many live states the scope's own level may hold. */
export function ownStatesMax(scope: Pick<StateScope, 'level'>): number {
  return scope.level === 'workspace'
    ? WORKSPACE_STATES_MAX
    : PROJECT_STATES_MAX;
}

const GROUP_ORDER: Record<string, number> = Object.fromEntries(
  STATE_GROUPS.map((g, i) => [g, i]),
);

const LEVEL_ORDER: Record<string, number> = {
  default: 0,
  workspace: 1,
  project: 2,
};

export function compareStates(a: WorkItemState, b: WorkItemState): number {
  const groupDiff = (GROUP_ORDER[a.group] ?? 99) - (GROUP_ORDER[b.group] ?? 99);
  if (groupDiff !== 0) return groupDiff;

  const levelDiff = (LEVEL_ORDER[a.level] ?? 99) - (LEVEL_ORDER[b.level] ?? 99);
  if (levelDiff !== 0) return levelDiff;

  const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (timeDiff !== 0) return timeDiff;

  return a.id.localeCompare(b.id);
}

export abstract class StateCatalog {
  abstract workspaceLevel(
    manager: EntityManager,
    scope: { workspaceId: string },
  ): Promise<WorkItemState[]>;

  abstract effectiveFor(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string },
  ): Promise<WorkItemState[]>;

  abstract lockEffectiveState(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string; stateId: string },
    mode?: 'pessimistic_read' | 'pessimistic_write',
  ): Promise<WorkItemState | null>;

  abstract lockReplacement(
    manager: EntityManager,
    scope: StateScope,
    stateId: string,
  ): Promise<WorkItemState | null>;

  abstract lockOwnState(
    manager: EntityManager,
    scope: StateScope,
    stateId: string,
  ): Promise<WorkItemState | null>;

  abstract findNameClash(
    manager: EntityManager,
    scope: StateScope,
    name: string,
    excludeId?: string,
  ): Promise<
    | { kind: 'none' }
    | { kind: 'same_or_upper_level' }
    | { kind: 'projects'; count: number }
  >;

  abstract workItemCounts(
    manager: EntityManager,
    input: { stateIds: string[]; scope: StateScope },
  ): Promise<Map<string, number>>;
}

@Injectable()
export class TypeOrmStateCatalog implements StateCatalog {
  async workspaceLevel(
    manager: EntityManager,
    scope: { workspaceId: string },
  ): Promise<WorkItemState[]> {
    const states = await manager.find(WorkItemState, {
      where: visibleStates({ level: 'workspace', ...scope }),
    });
    return states.sort(compareStates);
  }

  async effectiveFor(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string },
  ): Promise<WorkItemState[]> {
    const states = await manager.find(WorkItemState, {
      where: visibleStates({ level: 'project', ...scope }),
    });
    return states.sort(compareStates);
  }

  async lockEffectiveState(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string; stateId: string },
    mode: 'pessimistic_read' | 'pessimistic_write' = 'pessimistic_read',
  ): Promise<WorkItemState | null> {
    const { stateId, ...project } = scope;
    return manager.findOne(WorkItemState, {
      where: withEach(visibleStates({ level: 'project', ...project }), {
        id: stateId,
      }),
      lock: { mode },
    });
  }

  async lockReplacement(
    manager: EntityManager,
    scope: StateScope,
    stateId: string,
  ): Promise<WorkItemState | null> {
    return manager.findOne(WorkItemState, {
      where: withEach(visibleStates(scope), { id: stateId }),
      lock: { mode: 'pessimistic_read' },
    });
  }

  async lockOwnState(
    manager: EntityManager,
    scope: StateScope,
    stateId: string,
  ): Promise<WorkItemState | null> {
    return manager.findOne(WorkItemState, {
      where: { ...ownStates(scope), id: stateId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async findNameClash(
    manager: EntityManager,
    scope: StateScope,
    name: string,
    excludeId?: string,
  ): Promise<
    | { kind: 'none' }
    | { kind: 'same_or_upper_level' }
    | { kind: 'projects'; count: number }
  > {
    const lowerName = name.toLowerCase();

    // Same or upper level: what the scope sees (defaults, workspace, own project)
    const clash = await manager.findOne(WorkItemState, {
      where: withEach(visibleStates(scope), {
        name: equalsLowercase(lowerName),
        ...(excludeId && { id: Not(excludeId) }),
      }),
    });
    if (clash) {
      return { kind: 'same_or_upper_level' };
    }

    if (scope.level === 'project') {
      return { kind: 'none' };
    }

    // A workspace state may not reuse a name a live project of W already has
    const prjQb = manager
      .createQueryBuilder(WorkItemState, 's')
      .select('COUNT(DISTINCT s.projectId)', 'count')
      .where(projectStatesOf(scope.workspaceId))
      .andWhere('lower(s.name) = :name', { name: lowerName })
      .andWhere(
        (sub) => `s.projectId IN ${liveProjectIdsOf(sub, scope.workspaceId)}`,
      );

    if (excludeId) {
      prjQb.andWhere('s.id <> :excludeId', { excludeId });
    }

    const raw = await prjQb.getRawOne<{ count: string | number }>();
    const count = Number(raw?.count ?? 0);
    if (count > 0) {
      return { kind: 'projects', count };
    }

    return { kind: 'none' };
  }

  async workItemCounts(
    manager: EntityManager,
    input: { stateIds: string[]; scope: StateScope },
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const id of input.stateIds) {
      result.set(id, 0);
    }
    if (input.stateIds.length === 0) {
      return result;
    }

    const rows = await liveWorkItemsIn(manager, input.scope)
      .select('wi.stateId', 'stateId')
      .addSelect('COUNT(*)', 'count')
      .andWhere('wi.stateId IN (:...stateIds)', { stateIds: input.stateIds })
      .groupBy('wi.stateId')
      .getRawMany<{ stateId: string; count: string | number }>();
    for (const row of rows) {
      result.set(row.stateId, Number(row.count));
    }

    return result;
  }
}

/** Adds the same conditions to every OR branch of a `where`. */
function withEach(
  where: FindOptionsWhere<WorkItemState>[],
  extra: FindOptionsWhere<WorkItemState>,
): FindOptionsWhere<WorkItemState>[] {
  return where.map((branch) => ({ ...branch, ...extra }));
}
