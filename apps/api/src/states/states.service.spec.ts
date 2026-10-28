import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import type { WorkItemState } from './entities/workItemState.entity.js';
import { StateCatalog } from './stateCatalog.js';
import { StatesService } from './states.service.js';

describe('StatesService', () => {
  const fixedNow = new Date('2026-10-28T12:00:00Z');

  const defaultBacklog: WorkItemState = {
    id: 'backlog-id',
    level: 'default',
    defaultKey: 'backlog',
    workspaceId: null,
    projectId: null,
    name: 'Backlog',
    group: 'backlog',
    color: '#8E98A8',
    createdById: null,
    updatedById: null,
    deletedById: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  };

  const projectState: WorkItemState = {
    id: 'review-id',
    level: 'project',
    defaultKey: null,
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Review',
    group: 'active',
    color: '#3E7BD6',
    createdById: 'user-1',
    updatedById: 'user-1',
    deletedById: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  };

  function createService(states: WorkItemState[], countsMap = new Map<string, number>()) {
    const workItemCounts = vi.fn().mockResolvedValue(countsMap);
    const catalog: StateCatalog = {
      workspaceLevel: vi.fn(),
      effectiveFor: vi.fn().mockResolvedValue(states),
      lockEffectiveState: vi.fn(),
      lockReplacement: vi.fn(),
      lockOwnState: vi.fn(),
      findNameClash: vi.fn(),
      workItemCounts,
    };

    const dataSource = {
      manager: {} as EntityManager,
    } as DataSource;

    const service = new StatesService(dataSource, catalog);
    return { service, catalog, workItemCounts };
  }

  it('listForProject: returns effective states with ownCount, ownMax, and initialStateId', async () => {
    const { service } = createService([defaultBacklog, projectState]);

    const res = await service.listForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      canManage: false,
    });

    expect(res.ownCount).toBe(1);
    expect(res.ownMax).toBe(50);
    expect(res.initialStateId).toBe('backlog-id');
    expect(res.states).toHaveLength(2);
    expect(res.states[0]).toEqual({
      id: 'backlog-id',
      name: 'Backlog',
      group: 'backlog',
      color: '#8E98A8',
      level: 'default',
    });
    expect(res.states[0]?.workItemCount).toBeUndefined();
    expect(res.states[1]?.workItemCount).toBeUndefined();
  });

  it('listForProject: includes workItemCount when canManage is true', async () => {
    const counts = new Map<string, number>([
      ['backlog-id', 5],
      ['review-id', 2],
    ]);
    const { service, workItemCounts } = createService([defaultBacklog, projectState], counts);

    const res = await service.listForProject({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      canManage: true,
    });

    expect(workItemCounts).toHaveBeenCalled();
    expect(res.states[0]?.workItemCount).toBe(5);
    expect(res.states[1]?.workItemCount).toBe(2);
  });
});
