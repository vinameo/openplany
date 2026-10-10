import { describe, expect, it } from 'vitest';
import {
  enforcedWorkspacePermissions,
  parseWorkspacePermissions,
} from './workspacePermissions.js';

describe('workspacePermissions', () => {
  it('API-27 / parseWorkspacePermissions: removes non-workspace names, duplicates, and preserves order', () => {
    const parsed = parseWorkspacePermissions([
      'workspace.settings.update',
      'unknown.perm',
      'workspace.settings.update',
      'workspace.settings.view',
      'project.archive',
    ]);
    expect(parsed).toEqual([
      'workspace.settings.update',
      'workspace.settings.view',
    ]);
    expect(parseWorkspacePermissions([])).toEqual([]);
    expect(parseWorkspacePermissions(['foo', 'bar', 'project.view'])).toEqual([]);
  });

  it('AC-08: enforcedWorkspacePermissions returns only enforced permissions in order', () => {
    expect(
      enforcedWorkspacePermissions([
        'workspace.settings.view',
        'workspace.settings.update',
        'workspace.delete',
      ]),
    ).toEqual(['workspace.settings.update']);
    expect(
      enforcedWorkspacePermissions([
        'workspace.settings.view',
        'workspace.members.view',
      ]),
    ).toEqual([]);
    expect(enforcedWorkspacePermissions(['workspace.settings.view'])).toEqual([]);
    expect(enforcedWorkspacePermissions([])).toEqual([]);
  });
});
