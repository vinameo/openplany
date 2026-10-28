import { Injectable } from '@nestjs/common';
import {
  IsNull,
  Not,
  type EntityManager,
  type FindOptionsWhere,
} from 'typeorm';
import { STATE_GROUPS } from '@repo/contracts';
import { equalsLowercase } from '../database/findOperators.js';
import { Project } from '../projects/entities/project.entity.js';
import { WorkItem } from '../workItems/entities/workItem.entity.js';
import { WorkItemState } from './entities/workItemState.entity.js';

export type StateScope =
  | { level: 'workspace'; workspaceId: string }
  | { level: 'project'; workspaceId: string; projectId: string };

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
    const where: FindOptionsWhere<WorkItemState>[] = [
      { level: 'default', deletedAt: IsNull() },
      {
        level: 'workspace',
        workspaceId: scope.workspaceId,
        deletedAt: IsNull(),
      },
    ];
    const states = await manager.find(WorkItemState, { where });
    return states.sort(compareStates);
  }

  async effectiveFor(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string },
  ): Promise<WorkItemState[]> {
    const where: FindOptionsWhere<WorkItemState>[] = [
      { level: 'default', deletedAt: IsNull() },
      {
        level: 'workspace',
        workspaceId: scope.workspaceId,
        deletedAt: IsNull(),
      },
      {
        level: 'project',
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        deletedAt: IsNull(),
      },
    ];
    const states = await manager.find(WorkItemState, { where });
    return states.sort(compareStates);
  }

  async lockEffectiveState(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string; stateId: string },
    mode: 'pessimistic_read' | 'pessimistic_write' = 'pessimistic_read',
  ): Promise<WorkItemState | null> {
    const where: FindOptionsWhere<WorkItemState>[] = [
      { id: scope.stateId, level: 'default', deletedAt: IsNull() },
      {
        id: scope.stateId,
        level: 'workspace',
        workspaceId: scope.workspaceId,
        deletedAt: IsNull(),
      },
      {
        id: scope.stateId,
        level: 'project',
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        deletedAt: IsNull(),
      },
    ];
    return manager.findOne(WorkItemState, {
      where,
      lock: { mode },
    });
  }

  async lockReplacement(
    manager: EntityManager,
    scope: StateScope,
    stateId: string,
  ): Promise<WorkItemState | null> {
    if (scope.level === 'workspace') {
      const where: FindOptionsWhere<WorkItemState>[] = [
        { id: stateId, level: 'default', deletedAt: IsNull() },
        {
          id: stateId,
          level: 'workspace',
          workspaceId: scope.workspaceId,
          deletedAt: IsNull(),
        },
      ];
      return manager.findOne(WorkItemState, {
        where,
        lock: { mode: 'pessimistic_read' },
      });
    }

    return this.lockEffectiveState(
      manager,
      { workspaceId: scope.workspaceId, projectId: scope.projectId, stateId },
      'pessimistic_read',
    );
  }

  async lockOwnState(
    manager: EntityManager,
    scope: StateScope,
    stateId: string,
  ): Promise<WorkItemState | null> {
    if (scope.level === 'workspace') {
      return manager.findOne(WorkItemState, {
        where: {
          id: stateId,
          level: 'workspace',
          workspaceId: scope.workspaceId,
          deletedAt: IsNull(),
        },
        lock: { mode: 'pessimistic_write' },
      });
    }

    return manager.findOne(WorkItemState, {
      where: {
        id: stateId,
        level: 'project',
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        deletedAt: IsNull(),
      },
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

    if (scope.level === 'workspace') {
      const clashSame = await manager.findOne(WorkItemState, {
        where: [
          {
            level: 'default',
            name: equalsLowercase(lowerName),
            ...(excludeId && { id: Not(excludeId) }),
          },
          {
            level: 'workspace',
            workspaceId: scope.workspaceId,
            deletedAt: IsNull(),
            name: equalsLowercase(lowerName),
            ...(excludeId && { id: Not(excludeId) }),
          },
        ],
      });
      if (clashSame) {
        return { kind: 'same_or_upper_level' };
      }

      const prjQb = manager
        .createQueryBuilder(WorkItemState, 's')
        .select('COUNT(DISTINCT s.projectId)', 'count')
        .where('s.level = :level', { level: 'project' })
        .andWhere('s.workspaceId = :workspaceId', {
          workspaceId: scope.workspaceId,
        })
        .andWhere('s.deletedAt IS NULL')
        .andWhere('lower(s.name) = :name', { name: lowerName })
        .andWhere((sub) => {
          const pSub = sub
            .subQuery()
            .select('p.id')
            .from(Project, 'p')
            .where('p.workspaceId = :workspaceId', {
              workspaceId: scope.workspaceId,
            })
            .andWhere('p.deletedAt IS NULL')
            .getQuery();
          return `s.projectId IN ${pSub}`;
        });

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

    // project level
    const clash = await manager.findOne(WorkItemState, {
      where: [
        {
          level: 'default',
          name: equalsLowercase(lowerName),
          ...(excludeId && { id: Not(excludeId) }),
        },
        {
          level: 'workspace',
          workspaceId: scope.workspaceId,
          deletedAt: IsNull(),
          name: equalsLowercase(lowerName),
          ...(excludeId && { id: Not(excludeId) }),
        },
        {
          level: 'project',
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          deletedAt: IsNull(),
          name: equalsLowercase(lowerName),
          ...(excludeId && { id: Not(excludeId) }),
        },
      ],
    });

    if (clash) {
      return { kind: 'same_or_upper_level' };
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

    const qb = manager
      .createQueryBuilder(WorkItem, 'wi')
      .select('wi.stateId', 'stateId')
      .addSelect('COUNT(*)', 'count')
      .where('wi.workspaceId = :workspaceId', {
        workspaceId: input.scope.workspaceId,
      })
      .andWhere('wi.deletedAt IS NULL')
      .andWhere('wi.stateId IN (:...stateIds)', { stateIds: input.stateIds })
      .andWhere((qbSub) => {
        const subQuery = qbSub
          .subQuery()
          .select('p.id')
          .from(Project, 'p')
          .where('p.workspaceId = :workspaceId', {
            workspaceId: input.scope.workspaceId,
          })
          .andWhere('p.deletedAt IS NULL')
          .getQuery();
        return `wi.projectId IN ${subQuery}`;
      });

    if (input.scope.level === 'project') {
      qb.andWhere('wi.projectId = :projectId', {
        projectId: input.scope.projectId,
      });
    }

    qb.groupBy('wi.stateId');

    const rows = await qb.getRawMany<{
      stateId: string;
      count: string | number;
    }>();
    for (const row of rows) {
      result.set(row.stateId, Number(row.count));
    }

    return result;
  }
}
