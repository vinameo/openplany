import { describe, expect, it } from 'vitest';
import { WORKSPACE_ROLES, type WorkspaceRole } from './workspace.js';
import {
  ENFORCED_WORKSPACE_PERMISSIONS,
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLE_PERMISSIONS,
  enforcedWorkspacePermissionsOf,
  workspacePermissionsOf,
  type WorkspacePermission,
} from './workspacePermissions.js';

describe('workspacePermissions', () => {
  // AC-01: Bảng kỳ vọng viết tay theo đúng RQ B6.1
  const EXPECTED_B6_1: Record<
    WorkspacePermission,
    Record<WorkspaceRole, boolean>
  > = {
    'workspace.settings.view': { owner: true, admin: true, member: true, guest: true },
    'workspace.settings.update': { owner: true, admin: true, member: false, guest: false },
    'workspace.delete': { owner: true, admin: false, member: false, guest: false },
    'workspace.ownership.transfer': { owner: true, admin: false, member: false, guest: false },
    'workspace.members.view': { owner: true, admin: true, member: true, guest: false },
    'workspace.members.email.view': { owner: true, admin: true, member: false, guest: false },
    'workspace.members.add': { owner: true, admin: true, member: false, guest: false },
    'workspace.members.remove': { owner: true, admin: true, member: false, guest: false },
    'workspace.members.role.update': { owner: true, admin: true, member: false, guest: false },
    'workspace.members.history.view': { owner: true, admin: true, member: false, guest: false },
    'workspace.projects.create': { owner: true, admin: true, member: false, guest: false },
    'workspace.projects.browse': { owner: true, admin: true, member: true, guest: false },
    'workspace.projects.delete': { owner: true, admin: true, member: false, guest: false },
  };

  it('AC-01 (workspace): matches RQ B6.1 cell-by-cell for all 13 permissions and 4 roles', () => {
    expect(WORKSPACE_PERMISSIONS.length).toBe(13);
    for (const permission of WORKSPACE_PERMISSIONS) {
      for (const role of WORKSPACE_ROLES) {
        const hasPermission = workspacePermissionsOf(role).includes(permission);
        const expected = EXPECTED_B6_1[permission][role];
        expect(
          hasPermission,
          `Expected ${role} for ${permission} to be ${expected}`,
        ).toBe(expected);
      }
    }
  });

  it('AC-02: permissions are within catalog, contain no duplicates, and default deny', () => {
    const catalogSet = new Set<string>(WORKSPACE_PERMISSIONS);
    for (const role of WORKSPACE_ROLES) {
      const permissions = workspacePermissionsOf(role);
      const uniquePermissions = new Set(permissions);
      expect(uniquePermissions.size).toBe(permissions.length);
      for (const p of permissions) {
        expect(catalogSet.has(p)).toBe(true);
      }
    }
  });

  it('returns a new array copy from workspacePermissionsOf', () => {
    const perms1 = workspacePermissionsOf('owner');
    perms1.push('dummy' as any);
    const perms2 = workspacePermissionsOf('owner');
    expect(perms2).not.toContain('dummy');
    expect(perms2.length).toBe(13);
    expect(WORKSPACE_ROLE_PERMISSIONS.owner.length).toBe(13);
  });

  it('AC-08: enforcedWorkspacePermissionsOf returns only enforced permissions in order', () => {
    expect(enforcedWorkspacePermissionsOf('owner')).toEqual(['workspace.settings.update']);
    expect(enforcedWorkspacePermissionsOf('admin')).toEqual(['workspace.settings.update']);
    expect(enforcedWorkspacePermissionsOf('member')).toEqual([]);
    expect(enforcedWorkspacePermissionsOf('guest')).toEqual([]);

    for (const p of ENFORCED_WORKSPACE_PERMISSIONS) {
      expect(WORKSPACE_PERMISSIONS).toContain(p);
    }
  });

  it('AC-02: returns [] for null, undefined, or unrecognized role (default deny, INV-02)', () => {
    expect(workspacePermissionsOf(null as any)).toEqual([]);
    expect(workspacePermissionsOf(undefined as any)).toEqual([]);
    expect(workspacePermissionsOf('unknown' as any)).toEqual([]);
    expect(enforcedWorkspacePermissionsOf(null as any)).toEqual([]);
    expect(enforcedWorkspacePermissionsOf(undefined as any)).toEqual([]);
    expect(enforcedWorkspacePermissionsOf('unknown' as any)).toEqual([]);
  });
});
