import { describe, expect, it } from 'vitest';
import {
  enforcedProjectPermissions,
  parseProjectPermissions,
} from './projectPermissions.js';

describe('projectPermissions', () => {
  it('parseProjectPermissions filters invalid permissions, removes duplicates, and preserves order', () => {
    expect(parseProjectPermissions([])).toEqual([]);
    expect(
      parseProjectPermissions(['unknown.perm', 'bogus', 'workspace.foo']),
    ).toEqual([]);
    expect(
      parseProjectPermissions([
        'project.archive',
        'bogus',
        'project.settings.view',
        'project.archive',
      ]),
    ).toEqual(['project.archive', 'project.settings.view']);
  });

  it('enforcedProjectPermissions filters to ENFORCED_PROJECT_PERMISSIONS', () => {
    expect(enforcedProjectPermissions([])).toEqual([]);
    expect(
      enforcedProjectPermissions(['project.archive', 'unknown.perm']),
    ).toEqual([]);
    expect(
      enforcedProjectPermissions([
        'project.settings.view',
        'project.settings.update',
        'project.members.manage',
        'project.members.view',
        'project.archive',
      ]),
    ).toEqual([
      'project.members.view',
      'project.members.manage',
      'project.settings.view',
      'project.settings.update',
    ]);
  });


});
