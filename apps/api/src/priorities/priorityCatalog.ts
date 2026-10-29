import { Injectable } from '@nestjs/common';
import { IsNull, type EntityManager } from 'typeorm';
import { INITIAL_PRIORITY_KEY, PRIORITY_BANDS } from '@repo/contracts';
import {
  compareLevelThenAge,
  visibleLevelRows,
  withEach,
} from '../database/levels.js';
import { WorkItemPriority } from './entities/workItemPriority.entity.js';

const BAND_ORDER: Record<string, number> = Object.fromEntries(
  PRIORITY_BANDS.map((b, i) => [b, i]),
);

export function comparePriorities(
  a: WorkItemPriority,
  b: WorkItemPriority,
): number {
  const bandDiff = (BAND_ORDER[a.band] ?? 99) - (BAND_ORDER[b.band] ?? 99);
  if (bandDiff !== 0) return bandDiff;

  return compareLevelThenAge(a, b);
}

export abstract class PriorityCatalog {
  abstract effectiveFor(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string },
  ): Promise<WorkItemPriority[]>;

  abstract initialPriority(
    manager: EntityManager,
  ): Promise<WorkItemPriority | null>;

  abstract lockEffectivePriority(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string; priorityId: string },
  ): Promise<WorkItemPriority | null>;
}

@Injectable()
export class TypeOrmPriorityCatalog implements PriorityCatalog {
  async effectiveFor(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string },
  ): Promise<WorkItemPriority[]> {
    const priorities = await manager.find(WorkItemPriority, {
      where: visibleLevelRows<WorkItemPriority>({
        level: 'project',
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      }),
    });
    return priorities.sort(comparePriorities);
  }

  async initialPriority(
    manager: EntityManager,
  ): Promise<WorkItemPriority | null> {
    return await manager.findOne(WorkItemPriority, {
      where: {
        level: 'default',
        defaultKey: INITIAL_PRIORITY_KEY,
        deletedAt: IsNull(),
      },
    });
  }

  async lockEffectivePriority(
    manager: EntityManager,
    scope: { workspaceId: string; projectId: string; priorityId: string },
  ): Promise<WorkItemPriority | null> {
    const where = withEach(
      visibleLevelRows<WorkItemPriority>({
        level: 'project',
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      }),
      { id: scope.priorityId },
    );
    return await manager.findOne(WorkItemPriority, {
      where,
      lock: { mode: 'pessimistic_read' },
    });
  }
}
