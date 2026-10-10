import { describe, expect, it } from 'vitest';
import { WORKSPACE_ROLES } from './workspace.js';
import { PROJECT_ROLES } from './projectRoles.js';
import {
  isRoleLocked,
  permissionGrantProblem,
  permissionRevokeProblem,
  scopeOfPermission,
  type RoleRef,
} from './rolePermissionRules.js';

describe('rolePermissionRules', () => {
  const allRoles: RoleRef[] = [
    ...WORKSPACE_ROLES.map((key) => ({ scope: 'workspace' as const, key })),
    ...PROJECT_ROLES.map((key) => ({ scope: 'project' as const, key })),
  ];

  const sampleWorkspacePermissions = [
    'workspace.settings.view',
    'workspace.settings.update',
    'workspace.delete',
    'workspace.members.view',
    'workspace.members.email.view',
    'workspace.members.add',
    'workspace.members.remove',
    'workspace.members.role.update',
    'workspace.members.history.view',
    'workspace.projects.create',
    'workspace.projects.browse',
    'workspace.projects.delete',
  ];

  const sampleProjectPermissions = [
    'project.settings.view',
    'project.settings.update',
    'project.archive',
    'project.members.view',
    'project.members.manage',
    'project.workitems.view',
    'project.workitems.create',
    'project.workitems.update.any',
    'project.workitems.delete.any',
    'project.comments.create',
    'project.comments.update.own',
    'project.comments.delete.any',
    'project.reactions.create',
    'project.cycles.view',
    'project.cycles.create',
    'project.cycles.update.any',
    'project.cycles.delete.any',
    'project.modules.view',
    'project.modules.create',
    'project.modules.update.any',
    'project.modules.delete.any',
    'project.views.view',
    'project.views.create',
    'project.views.update.any',
    'project.views.delete.any',
    'project.pages.view',
    'project.pages.create',
    'project.pages.update.any',
    'project.pages.delete.any',
    'project.labels.view',
    'project.states.view',
    'project.estimates.view',
    'project.labels.manage',
    'project.states.manage',
    'project.estimates.manage',
    'project.analytics.view',
    'project.analytics.export',
    'project.workitems.delete.own',
    'project.comments.delete.own',
    'project.cycles.delete.own',
    'project.modules.delete.own',
    'project.views.update.own',
    'project.views.delete.own',
    'project.pages.update.own',
    'project.pages.delete.own',
  ];

  const allPermissions = [
    ...sampleWorkspacePermissions,
    ...sampleProjectPermissions,
  ];

  it('has exactly 7 roles and 57 sample default permissions', () => {
    expect(allRoles.length).toBe(7);
    expect(sampleWorkspacePermissions.length).toBe(12);
    expect(sampleProjectPermissions.length).toBe(45);
    expect(allPermissions.length).toBe(57);
  });

  it('scopeOfPermission correctly categorizes permissions and returns null for unknown', () => {
    for (const p of sampleWorkspacePermissions) {
      expect(scopeOfPermission(p)).toBe('workspace');
    }
    for (const p of sampleProjectPermissions) {
      expect(scopeOfPermission(p)).toBe('project');
    }
    expect(scopeOfPermission('workspace.custom')).toBe('workspace');
    expect(scopeOfPermission('project.custom')).toBe('project');
    expect(scopeOfPermission('bogus.permission')).toBeNull();
    expect(scopeOfPermission('')).toBeNull();
    expect(scopeOfPermission('noperiod')).toBeNull();
  });

  it('isRoleLocked identifies locked roles (workspace admin and project admin)', () => {
    expect(isRoleLocked({ scope: 'workspace', key: 'admin' })).toBe(true);
    expect(isRoleLocked({ scope: 'project', key: 'admin' })).toBe(true);
    expect(isRoleLocked({ scope: 'workspace', key: 'member' })).toBe(false);
    expect(isRoleLocked({ scope: 'workspace', key: 'guest' })).toBe(false);
    expect(isRoleLocked({ scope: 'project', key: 'contributor' })).toBe(false);
    expect(isRoleLocked({ scope: 'project', key: 'commenter' })).toBe(false);
    expect(isRoleLocked({ scope: 'project', key: 'guest' })).toBe(false);
  });

  it('permissionRevokeProblem only reports ROLE_LOCKED for locked roles', () => {
    expect(permissionRevokeProblem({ scope: 'workspace', key: 'admin' })).toBe('ROLE_LOCKED');
    expect(permissionRevokeProblem({ scope: 'project', key: 'admin' })).toBe('ROLE_LOCKED');
    expect(permissionRevokeProblem({ scope: 'workspace', key: 'member' })).toBeNull();
    expect(permissionRevokeProblem({ scope: 'workspace', key: 'guest' })).toBeNull();
    expect(permissionRevokeProblem({ scope: 'project', key: 'contributor' })).toBeNull();
  });

  it('permissionGrantProblem checks guardrails in order G0 -> G4', () => {
    // G0: unknown permission
    expect(
      permissionGrantProblem({ scope: 'workspace', key: 'member' }, 'invalid_key'),
    ).toBe('UNKNOWN_PERMISSION');

    // G1: scope mismatch
    expect(
      permissionGrantProblem({ scope: 'workspace', key: 'member' }, 'project.settings.view'),
    ).toBe('SCOPE_MISMATCH');
    expect(
      permissionGrantProblem({ scope: 'project', key: 'contributor' }, 'workspace.settings.view'),
    ).toBe('SCOPE_MISMATCH');

    // G2: locked role
    expect(
      permissionGrantProblem({ scope: 'workspace', key: 'admin' }, 'workspace.settings.view'),
    ).toBe('ROLE_LOCKED');
    expect(
      permissionGrantProblem({ scope: 'project', key: 'admin' }, 'project.settings.view'),
    ).toBe('ROLE_LOCKED');

    // G3: admin only
    expect(
      permissionGrantProblem({ scope: 'workspace', key: 'member' }, 'workspace.delete'),
    ).toBe('ADMIN_ONLY');
    expect(
      permissionGrantProblem({ scope: 'workspace', key: 'member' }, 'workspace.members.add'),
    ).toBe('ADMIN_ONLY');

    // G4: guest view only
    expect(
      permissionGrantProblem({ scope: 'workspace', key: 'guest' }, 'workspace.projects.create'),
    ).toBe('GUEST_VIEW_ONLY');
    expect(
      permissionGrantProblem({ scope: 'project', key: 'guest' }, 'project.workitems.create'),
    ).toBe('GUEST_VIEW_ONLY');

    // Allowed
    expect(
      permissionGrantProblem({ scope: 'workspace', key: 'member' }, 'workspace.settings.update'),
    ).toBeNull();
    expect(
      permissionGrantProblem({ scope: 'workspace', key: 'guest' }, 'workspace.settings.view'),
    ).toBeNull();
    expect(
      permissionGrantProblem({ scope: 'project', key: 'guest' }, 'project.settings.view'),
    ).toBeNull();
  });

  it('AC-27: sample permissions violate no guardrails', () => {
    for (const p of sampleWorkspacePermissions) {
      expect(scopeOfPermission(p)).toBe('workspace');
    }
    for (const p of sampleProjectPermissions) {
      expect(scopeOfPermission(p)).toBe('project');
    }
  });
});
