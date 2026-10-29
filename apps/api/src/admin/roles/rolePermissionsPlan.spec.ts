import { describe, expect, it } from 'vitest';
import { PERMISSION_GRANT_PROBLEM_REFS } from '@repo/contracts';
import {
  planRolePermissionChanges,
  type StoredRolePermissions,
} from './rolePermissionsPlan.js';

describe('planRolePermissionChanges', () => {
  const currentDefaults: StoredRolePermissions[] = [
    {
      scope: 'workspace',
      key: 'admin',
      version: 1,
      permissions: [
        'workspace.settings.view',
        'workspace.settings.update',
        'workspace.delete',
        'workspace.members.view',
        'workspace.members.add',
        'workspace.members.remove',
        'workspace.members.role.update',
        'workspace.projects.browse',
        'workspace.projects.create',
        'workspace.security.view',
        'workspace.security.update',
        'workspace.billing.manage',
      ],
    },
    {
      scope: 'workspace',
      key: 'member',
      version: 1,
      permissions: [
        'workspace.settings.view',
        'workspace.members.view',
        'workspace.projects.browse',
      ],
    },
    {
      scope: 'workspace',
      key: 'guest',
      version: 1,
      permissions: ['workspace.settings.view'],
    },
    {
      scope: 'project',
      key: 'admin',
      version: 1,
      permissions: [
        'project.settings.view',
        'project.settings.update',
        'project.workitems.view',
      ],
    },
    {
      scope: 'project',
      key: 'contributor',
      version: 1,
      permissions: ['project.settings.view', 'project.workitems.create'],
    },
    {
      scope: 'project',
      key: 'commenter',
      version: 1,
      permissions: ['project.settings.view'],
    },
    {
      scope: 'project',
      key: 'viewer',
      version: 1,
      permissions: ['project.settings.view'],
    },
  ];

  it('group 1: returns invalid for unknown roles or duplicate roles in batch', () => {
    const unknownRolePlan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'superadmin',
        version: 1,
        permissions: ['workspace.settings.view'],
      },
      {
        scope: 'project',
        key: 'manager',
        version: 1,
        permissions: ['project.settings.view'],
      },
    ]);

    expect(unknownRolePlan).toEqual({
      status: 'invalid',
      fields: {
        'workspace.superadmin': { key: 'admin:errors.unknownRole' },
        'project.manager': { key: 'admin:errors.unknownRole' },
      },
    });

    const duplicatePlan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: ['workspace.settings.view'],
      },
      {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: ['workspace.settings.view'],
      },
    ]);

    expect(duplicatePlan).toEqual({
      status: 'invalid',
      fields: {
        'workspace.member': { key: 'admin:errors.listedMoreThanOnce' },
      },
    });
  });

  it('group 2: returns invalid for unknown permission names', () => {
    const plan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: [
          'workspace.settings.view',
          'workspace.invalid_perm',
          'random.nonsense',
        ],
      },
    ]);

    expect(plan).toEqual({
      status: 'invalid',
      fields: {
        'workspace.member:workspace.invalid_perm':
          PERMISSION_GRANT_PROBLEM_REFS.UNKNOWN_PERMISSION,
        'workspace.member:random.nonsense':
          PERMISSION_GRANT_PROBLEM_REFS.UNKNOWN_PERMISSION,
      },
    });
  });

  it('group 3: returns conflict when version does not match stored version', () => {
    const plan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'member',
        version: 2, // stored version is 1
        permissions: ['workspace.settings.view'],
      },
    ]);

    expect(plan).toEqual({ status: 'conflict' });
  });

  it('group 4: rejects modifications to locked roles (ROLE_LOCKED)', () => {
    // Attempt to revoke from workspace admin
    const revokeAdminPlan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'admin',
        version: 1,
        permissions: ['workspace.settings.view'], // missing 11 permissions
      },
    ]);

    expect(revokeAdminPlan.status).toBe('invalid');
    if (revokeAdminPlan.status === 'invalid') {
      expect(
        revokeAdminPlan.fields['workspace.admin:workspace.delete'],
      ).toEqual(PERMISSION_GRANT_PROBLEM_REFS.ROLE_LOCKED);
    }

    // Attempt to revoke from project admin
    const revokeProjAdminPlan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'project',
        key: 'admin',
        version: 1,
        permissions: [],
      },
    ]);

    expect(revokeProjAdminPlan.status).toBe('invalid');
    if (revokeProjAdminPlan.status === 'invalid') {
      expect(
        revokeProjAdminPlan.fields['project.admin:project.settings.view'],
      ).toEqual(PERMISSION_GRANT_PROBLEM_REFS.ROLE_LOCKED);
    }
  });

  it('group 4: rejects granting admin-only permissions to non-admin roles (ADMIN_ONLY)', () => {
    const plan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: [
          'workspace.settings.view',
          'workspace.members.view',
          'workspace.projects.browse',
          'workspace.delete',
          'workspace.members.add',
        ],
      },
    ]);

    expect(plan).toEqual({
      status: 'invalid',
      fields: {
        'workspace.member:workspace.delete':
          PERMISSION_GRANT_PROBLEM_REFS.ADMIN_ONLY,
        'workspace.member:workspace.members.add':
          PERMISSION_GRANT_PROBLEM_REFS.ADMIN_ONLY,
      },
    });
  });

  it('group 4: rejects granting non-view permissions to guest roles (GUEST_VIEW_ONLY)', () => {
    const plan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'guest',
        version: 1,
        permissions: ['workspace.settings.view', 'workspace.projects.browse'],
      },
      {
        scope: 'project',
        key: 'viewer',
        version: 1,
        permissions: ['project.settings.view', 'project.workitems.create'],
      },
    ]);

    expect(plan).toEqual({
      status: 'invalid',
      fields: {
        'workspace.guest:workspace.projects.browse':
          PERMISSION_GRANT_PROBLEM_REFS.GUEST_VIEW_ONLY,
        'project.viewer:project.workitems.create':
          PERMISSION_GRANT_PROBLEM_REFS.GUEST_VIEW_ONLY,
      },
    });
  });

  it('group 4: rejects granting permissions of different scope (SCOPE_MISMATCH)', () => {
    const plan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: ['workspace.settings.view', 'project.workitems.view'],
      },
    ]);

    expect(plan).toEqual({
      status: 'invalid',
      fields: {
        'workspace.member:project.workitems.view':
          PERMISSION_GRANT_PROBLEM_REFS.SCOPE_MISMATCH,
      },
    });
  });

  it('group 4: mixed batch with valid changes and invalid changes rejects entire batch', () => {
    const plan = planRolePermissionChanges(currentDefaults, [
      // Valid change: adding settings.update to member
      {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: [
          'workspace.settings.view',
          'workspace.members.view',
          'workspace.projects.browse',
          'workspace.settings.update',
        ],
      },
      // Invalid change: adding non-view to guest
      {
        scope: 'workspace',
        key: 'guest',
        version: 1,
        permissions: ['workspace.settings.view', 'workspace.projects.browse'],
      },
    ]);

    expect(plan).toEqual({
      status: 'invalid',
      fields: {
        'workspace.guest:workspace.projects.browse':
          PERMISSION_GRANT_PROBLEM_REFS.GUEST_VIEW_ONLY,
      },
    });
  });

  it('group 5: successfully plans valid grants and revokes, excluding unchanged roles', () => {
    const plan = planRolePermissionChanges(currentDefaults, [
      // Member: grant settings.update, revoke projects.browse
      {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: [
          'workspace.settings.view',
          'workspace.members.view',
          'workspace.settings.update',
        ],
      },
      // Guest: no change
      {
        scope: 'workspace',
        key: 'guest',
        version: 1,
        permissions: ['workspace.settings.view'],
      },
    ]);

    expect(plan).toEqual({
      status: 'ok',
      grants: [
        {
          scope: 'workspace',
          key: 'member',
          permission: 'workspace.settings.update',
        },
      ],
      revokes: [
        {
          scope: 'workspace',
          key: 'member',
          permission: 'workspace.projects.browse',
        },
      ],
      changedRoles: [{ scope: 'workspace', key: 'member' }],
    });
  });

  it('handles input permissions with duplicate entries cleanly', () => {
    const plan = planRolePermissionChanges(currentDefaults, [
      {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: [
          'workspace.settings.view',
          'workspace.settings.view',
          'workspace.members.view',
          'workspace.projects.browse',
          'workspace.settings.update',
          'workspace.settings.update',
        ],
      },
    ]);

    expect(plan).toEqual({
      status: 'ok',
      grants: [
        {
          scope: 'workspace',
          key: 'member',
          permission: 'workspace.settings.update',
        },
      ],
      revokes: [],
      changedRoles: [{ scope: 'workspace', key: 'member' }],
    });
  });
});
