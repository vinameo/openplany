import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import type { WorkItemPriority } from './entities/workItemPriority.entity.js';
import { PrioritiesService } from './priorities.service.js';
import type { PriorityCatalog } from './priorityCatalog.js';

describe('PrioritiesService', () => {
  const samplePriorities: WorkItemPriority[] = [
    {
      id: 'prio-urgent',
      level: 'default',
      defaultKey: 'urgent',
      workspaceId: null,
      projectId: null,
      name: 'Urgent',
      band: 'urgent',
      color: '#B05A5A',
      createdById: null,
      updatedById: null,
      deletedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      id: 'prio-high',
      level: 'default',
      defaultKey: 'high',
      workspaceId: null,
      projectId: null,
      name: 'High',
      band: 'high',
      color: '#D0642B',
      createdById: null,
      updatedById: null,
      deletedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      id: 'prio-none',
      level: 'default',
      defaultKey: 'none',
      workspaceId: null,
      projectId: null,
      name: 'None',
      band: 'none',
      color: '#8E98A8',
      createdById: null,
      updatedById: null,
      deletedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
  ];

  function setup(prioritiesResult: WorkItemPriority[]) {
    const effectiveForMock = vi.fn<
      (
        manager: EntityManager,
        scope: { workspaceId: string; projectId: string },
      ) => Promise<WorkItemPriority[]>
    >(async () => prioritiesResult);
    const catalog: PriorityCatalog = {
      effectiveFor: effectiveForMock,
      initialPriority: vi.fn(),
      lockEffectivePriority: vi.fn(),
    };

    const mockManager = {} as EntityManager;
    const dataSource = { manager: mockManager } as DataSource;

    const service = new PrioritiesService(catalog, dataSource);
    return { service, catalog, effectiveForMock, mockManager };
  }

  it('lists priorities for project and identifies initialPriorityId (AC-04)', async () => {
    const { service, effectiveForMock, mockManager } = setup(samplePriorities);

    const result = await service.listForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
    });

    expect(effectiveForMock).toHaveBeenCalledWith(mockManager, {
      workspaceId: 'ws-1',
      projectId: 'proj-1',
    });

    expect(result.initialPriorityId).toBe('prio-none');
    expect(result.priorities).toHaveLength(3);

    // INV-08: Exact fields of PriorityResponse (no workspaceId, projectId, audit)
    expect(result.priorities[0]).toEqual({
      id: 'prio-urgent',
      name: 'Urgent',
      band: 'urgent',
      color: '#B05A5A',
      level: 'default',
      defaultKey: 'urgent',
    });
    expect(result.priorities[0]).not.toHaveProperty('workspaceId');
    expect(result.priorities[0]).not.toHaveProperty('projectId');
    expect(result.priorities[0]).not.toHaveProperty('createdAt');
  });

  it('throws an error if initial priority is missing from database', async () => {
    const prioritiesWithoutNone = samplePriorities.filter(
      (p) => p.defaultKey !== 'none',
    );
    const { service } = setup(prioritiesWithoutNone);

    await expect(
      service.listForProject({ workspaceId: 'ws-1', projectId: 'proj-1' }),
    ).rejects.toThrow("Initial priority 'none' not found");
  });
});
