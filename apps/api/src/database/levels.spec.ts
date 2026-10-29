import { describe, expect, it } from 'vitest';
import { IsNull } from 'typeorm';
import {
  compareLevelThenAge,
  defaultLevelRows,
  ownLevelRows,
  ownProjectLevelRows,
  ownWorkspaceLevelRows,
  visibleLevelRows,
  withEach,
  type LeveledRow,
} from './levels.js';

describe('levels seam', () => {
  it('builds defaultLevelRows with deletedAt IsNull', () => {
    expect(defaultLevelRows()).toEqual({
      level: 'default',
      deletedAt: IsNull(),
    });
  });

  it('builds ownWorkspaceLevelRows with workspaceId and deletedAt IsNull', () => {
    expect(ownWorkspaceLevelRows('ws-1')).toEqual({
      level: 'workspace',
      workspaceId: 'ws-1',
      deletedAt: IsNull(),
    });
  });

  it('builds ownProjectLevelRows with workspaceId, projectId, and deletedAt IsNull', () => {
    expect(
      ownProjectLevelRows({ workspaceId: 'ws-1', projectId: 'proj-1' }),
    ).toEqual({
      level: 'project',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      deletedAt: IsNull(),
    });
  });

  it('builds ownLevelRows according to scope level', () => {
    expect(ownLevelRows({ level: 'workspace', workspaceId: 'ws-1' })).toEqual({
      level: 'workspace',
      workspaceId: 'ws-1',
      deletedAt: IsNull(),
    });
    expect(
      ownLevelRows({
        level: 'project',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
      }),
    ).toEqual({
      level: 'project',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      deletedAt: IsNull(),
    });
  });

  it('builds visibleLevelRows with 2 branches for workspace and 3 branches for project', () => {
    const wsBranches = visibleLevelRows({
      level: 'workspace',
      workspaceId: 'ws-1',
    });
    expect(wsBranches).toHaveLength(2);
    expect(wsBranches[0]).toEqual({
      level: 'default',
      deletedAt: IsNull(),
    });
    expect(wsBranches[1]).toEqual({
      level: 'workspace',
      workspaceId: 'ws-1',
      deletedAt: IsNull(),
    });

    const prjBranches = visibleLevelRows({
      level: 'project',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
    });
    expect(prjBranches).toHaveLength(3);
    expect(prjBranches[2]).toEqual({
      level: 'project',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      deletedAt: IsNull(),
    });
  });

  it('adds extra condition to every branch with withEach', () => {
    type TestRow = { id: string; level: 'default' | 'workspace' | 'project' };
    const branches: import('typeorm').FindOptionsWhere<TestRow>[] = [
      { level: 'default' },
      { level: 'workspace' },
    ];
    const combined = withEach<TestRow>(branches, { id: 'row-1' });
    expect(combined).toEqual([
      { level: 'default', id: 'row-1' },
      { level: 'workspace', id: 'row-1' },
    ]);
  });

  it('compares by level (default < workspace < project), then createdAt, then id', () => {
    const now = new Date('2026-10-29T10:00:00Z');
    const earlier = new Date('2026-10-29T09:00:00Z');

    const defaultRow: LeveledRow = {
      id: 'b',
      level: 'default',
      workspaceId: null,
      projectId: null,
      deletedAt: null,
      createdAt: now,
    };
    const workspaceRow: LeveledRow = {
      id: 'a',
      level: 'workspace',
      workspaceId: 'ws-1',
      projectId: null,
      deletedAt: null,
      createdAt: earlier,
    };
    const projectRow: LeveledRow = {
      id: 'c',
      level: 'project',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      deletedAt: null,
      createdAt: earlier,
    };

    // Level takes precedence over createdAt
    expect(compareLevelThenAge(defaultRow, workspaceRow)).toBeLessThan(0);
    expect(compareLevelThenAge(workspaceRow, projectRow)).toBeLessThan(0);

    // Same level compares by createdAt
    const workspaceRowLater: LeveledRow = {
      ...workspaceRow,
      id: 'z',
      createdAt: now,
    };
    expect(compareLevelThenAge(workspaceRow, workspaceRowLater)).toBeLessThan(
      0,
    );

    // Same level and createdAt compares by id
    const workspaceRowSameTime: LeveledRow = {
      ...workspaceRow,
      id: 'b',
    };
    expect(
      compareLevelThenAge(workspaceRow, workspaceRowSameTime),
    ).toBeLessThan(0);
  });
});
