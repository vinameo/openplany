import { describe, expect, it } from 'vitest';
import type { WorkItemPriority } from './entities/workItemPriority.entity.js';
import { comparePriorities } from './priorityCatalog.js';

describe('PriorityCatalog', () => {
  const basePriority = (
    overrides: Partial<WorkItemPriority>,
  ): WorkItemPriority => ({
    id: 'p-1',
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
    createdAt: new Date('2026-10-28T00:00:00Z'),
    updatedAt: new Date('2026-10-28T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });

  it('orders priorities by band according to PRIORITY_BANDS (urgent < high < medium < low < none)', () => {
    const urgent = basePriority({
      id: '1',
      band: 'urgent',
      defaultKey: 'urgent',
    });
    const high = basePriority({ id: '2', band: 'high', defaultKey: 'high' });
    const medium = basePriority({
      id: '3',
      band: 'medium',
      defaultKey: 'medium',
    });
    const low = basePriority({ id: '4', band: 'low', defaultKey: 'low' });
    const none = basePriority({ id: '5', band: 'none', defaultKey: 'none' });

    const list = [none, medium, urgent, low, high];
    list.sort(comparePriorities);

    expect(list.map((p) => p.band)).toEqual([
      'urgent',
      'high',
      'medium',
      'low',
      'none',
    ]);
  });

  it('orders priorities within the same band by level (default < workspace < project)', () => {
    const def = basePriority({
      id: '1',
      level: 'default',
      band: 'high',
      defaultKey: 'high',
    });
    const ws = basePriority({
      id: '2',
      level: 'workspace',
      band: 'high',
      workspaceId: 'ws-1',
      defaultKey: null,
    });
    const prj = basePriority({
      id: '3',
      level: 'project',
      band: 'high',
      workspaceId: 'ws-1',
      projectId: 'prj-1',
      defaultKey: null,
    });

    const list = [prj, def, ws];
    list.sort(comparePriorities);

    expect(list.map((p) => p.level)).toEqual([
      'default',
      'workspace',
      'project',
    ]);
  });

  it('orders priorities with same band and level by createdAt then id', () => {
    const older = basePriority({
      id: 'b',
      level: 'workspace',
      band: 'medium',
      createdAt: new Date('2026-10-20T00:00:00Z'),
    });
    const newerA = basePriority({
      id: 'a',
      level: 'workspace',
      band: 'medium',
      createdAt: new Date('2026-10-25T00:00:00Z'),
    });
    const newerZ = basePriority({
      id: 'z',
      level: 'workspace',
      band: 'medium',
      createdAt: new Date('2026-10-25T00:00:00Z'),
    });

    const list = [newerZ, older, newerA];
    list.sort(comparePriorities);

    expect(list.map((p) => p.id)).toEqual(['b', 'a', 'z']);
  });
});
