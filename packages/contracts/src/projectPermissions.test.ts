import { describe, expect, it } from 'vitest';
import { PROJECT_ROLES, type ProjectRole } from './projectRoles.js';
import {
  ENFORCED_PROJECT_PERMISSIONS,
  PROJECT_PERMISSIONS,
  PROJECT_ROLE_PERMISSIONS,
  enforcedProjectPermissionsOf,
  projectPermissionsOf,
  type ProjectPermission,
} from './projectPermissions.js';

describe('projectPermissions', () => {
  const EXPECTED_B6_2: Record<ProjectPermission, Record<ProjectRole, boolean>> = {
    'project.settings.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.settings.update': { admin: true, contributor: false, commenter: false, guest: false },
    'project.archive': { admin: true, contributor: false, commenter: false, guest: false },
    'project.members.view': { admin: true, contributor: true, commenter: true, guest: false },
    'project.members.manage': { admin: true, contributor: false, commenter: false, guest: false },
    'project.workitems.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.workitems.create': { admin: true, contributor: true, commenter: false, guest: false },
    'project.workitems.update.any': { admin: true, contributor: true, commenter: false, guest: false },
    'project.workitems.delete.any': { admin: true, contributor: false, commenter: false, guest: false },
    'project.workitems.delete.own': { admin: false, contributor: true, commenter: false, guest: false },
    'project.comments.create': { admin: true, contributor: true, commenter: true, guest: false },
    'project.comments.update.own': { admin: true, contributor: true, commenter: true, guest: false },
    'project.comments.delete.any': { admin: true, contributor: false, commenter: false, guest: false },
    'project.comments.delete.own': { admin: false, contributor: true, commenter: true, guest: false },
    'project.reactions.create': { admin: true, contributor: true, commenter: true, guest: false },
    'project.cycles.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.cycles.create': { admin: true, contributor: true, commenter: false, guest: false },
    'project.cycles.update.any': { admin: true, contributor: true, commenter: false, guest: false },
    'project.cycles.delete.any': { admin: true, contributor: false, commenter: false, guest: false },
    'project.cycles.delete.own': { admin: false, contributor: true, commenter: false, guest: false },
    'project.modules.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.modules.create': { admin: true, contributor: true, commenter: false, guest: false },
    'project.modules.update.any': { admin: true, contributor: true, commenter: false, guest: false },
    'project.modules.delete.any': { admin: true, contributor: false, commenter: false, guest: false },
    'project.modules.delete.own': { admin: false, contributor: true, commenter: false, guest: false },
    'project.views.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.views.create': { admin: true, contributor: true, commenter: false, guest: false },
    'project.views.update.any': { admin: true, contributor: false, commenter: false, guest: false },
    'project.views.delete.any': { admin: true, contributor: false, commenter: false, guest: false },
    'project.views.update.own': { admin: false, contributor: true, commenter: false, guest: false },
    'project.views.delete.own': { admin: false, contributor: true, commenter: false, guest: false },
    'project.pages.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.pages.create': { admin: true, contributor: true, commenter: false, guest: false },
    'project.pages.update.any': { admin: true, contributor: false, commenter: false, guest: false },
    'project.pages.delete.any': { admin: true, contributor: false, commenter: false, guest: false },
    'project.pages.update.own': { admin: false, contributor: true, commenter: false, guest: false },
    'project.pages.delete.own': { admin: false, contributor: true, commenter: false, guest: false },
    'project.labels.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.states.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.estimates.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.labels.manage': { admin: true, contributor: false, commenter: false, guest: false },
    'project.states.manage': { admin: true, contributor: false, commenter: false, guest: false },
    'project.estimates.manage': { admin: true, contributor: false, commenter: false, guest: false },
    'project.analytics.view': { admin: true, contributor: true, commenter: true, guest: true },
    'project.analytics.export': { admin: true, contributor: true, commenter: false, guest: false },
  };

  it('AC-01 (project): matches RQ B6.2 cell-by-cell for 45 permissions and 4 roles, no project.delete', () => {
    expect(PROJECT_PERMISSIONS.length).toBe(45);
    expect(PROJECT_PERMISSIONS).not.toContain('project.delete');

    for (const permission of PROJECT_PERMISSIONS) {
      for (const role of PROJECT_ROLES) {
        const hasPermission = projectPermissionsOf(role).includes(permission);
        const expected = EXPECTED_B6_2[permission][role];
        expect(
          hasPermission,
          `Expected ${role} for ${permission} to be ${expected}`,
        ).toBe(expected);
      }
    }
  });

  it('AC-01b: ladder check of view permissions and role capabilities', () => {
    const viewPermissionsOf = (role: ProjectRole) =>
      projectPermissionsOf(role).filter((p) => p.endsWith('.view'));

    const guestViews = new Set(viewPermissionsOf('guest'));
    const commenterViews = new Set(viewPermissionsOf('commenter'));
    const contributorViews = new Set(viewPermissionsOf('contributor'));
    const adminViews = new Set(viewPermissionsOf('admin'));

    // guestViews ⊂ commenterViews
    expect(guestViews.size).toBeLessThan(commenterViews.size);
    for (const p of guestViews) {
      expect(commenterViews.has(p)).toBe(true);
    }
    // commenterViews ⊆ contributorViews
    for (const p of commenterViews) {
      expect(contributorViews.has(p)).toBe(true);
    }
    // contributorViews ⊆ adminViews
    for (const p of contributorViews) {
      expect(adminViews.has(p)).toBe(true);
    }

    // Guest only has …view permissions
    const guestAll = projectPermissionsOf('guest');
    for (const p of guestAll) {
      expect(p.endsWith('.view')).toBe(true);
    }
    // Guest does NOT have project.members.view
    expect(guestAll).not.toContain('project.members.view');

    // Only Contributor has .delete.own for workitems, cycles, modules, views, pages
    const ownDeletePerms: ProjectPermission[] = [
      'project.workitems.delete.own',
      'project.cycles.delete.own',
      'project.modules.delete.own',
      'project.views.delete.own',
      'project.pages.delete.own',
    ];
    for (const p of ownDeletePerms) {
      expect(projectPermissionsOf('contributor')).toContain(p);
      expect(projectPermissionsOf('admin')).not.toContain(p);
      expect(projectPermissionsOf('commenter')).not.toContain(p);
      expect(projectPermissionsOf('guest')).not.toContain(p);
    }
  });

  it('AC-02: projectPermissionsOf(null) returns [], no duplicates, returns copy', () => {
    expect(projectPermissionsOf(null)).toEqual([]);
    expect(enforcedProjectPermissionsOf(null)).toEqual([]);

    for (const role of PROJECT_ROLES) {
      const perms = projectPermissionsOf(role);
      const unique = new Set(perms);
      expect(unique.size).toBe(perms.length);
      for (const p of perms) {
        expect(PROJECT_PERMISSIONS).toContain(p);
      }
    }

    const perms1 = projectPermissionsOf('admin');
    perms1.push('dummy' as any);
    const perms2 = projectPermissionsOf('admin');
    expect(perms2).not.toContain('dummy');
    expect(PROJECT_ROLE_PERMISSIONS.admin.length).toBe(37);
  });

  it('enforcedProjectPermissionsOf returns [] for all roles currently', () => {
    expect(ENFORCED_PROJECT_PERMISSIONS).toEqual([]);
    for (const role of PROJECT_ROLES) {
      expect(enforcedProjectPermissionsOf(role)).toEqual([]);
    }
  });

  it('AC-02: returns [] for undefined or unrecognized project role (default deny, INV-02)', () => {
    expect(projectPermissionsOf(undefined as any)).toEqual([]);
    expect(projectPermissionsOf('unknown' as any)).toEqual([]);
    expect(enforcedProjectPermissionsOf(undefined as any)).toEqual([]);
    expect(enforcedProjectPermissionsOf('unknown' as any)).toEqual([]);
  });
});
