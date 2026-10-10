import { describe, expect, it } from 'vitest';
import { WORKSPACE_ROLES, type WorkspaceRole } from './workspace.js';
import { PROJECT_ROLES, type ProjectRole } from './projectRoles.js';
import type { ProjectRolePermissions } from './projectPermissions.js';
import {
  effectiveProjectRole,
  isProjectRoleClamped,
  resolveProjectAccess,
} from './projectAccess.js';

describe('projectAccess', () => {
  const allWorkspaceRoles: (WorkspaceRole | null)[] = [...WORKSPACE_ROLES, null];
  const allProjectRoles: (ProjectRole | null)[] = [...PROJECT_ROLES, null];

  // Table A5:
  // | Workspace \ Assigned | null | admin | contributor | commenter | guest |
  // | admin                | admin| admin | admin       | admin     | admin |
  // | member               | null | admin | contributor | commenter | guest |
  // | guest                | null | guest | guest       | guest     | guest |
  // | null                 | null | null  | null        | null      | null  |
  const EXPECTED_A5: Record<string, ProjectRole | null> = {
    'admin:null': 'admin',
    'admin:admin': 'admin',
    'admin:contributor': 'admin',
    'admin:commenter': 'admin',
    'admin:guest': 'admin',

    'member:null': null,
    'member:admin': 'admin',
    'member:contributor': 'contributor',
    'member:commenter': 'commenter',
    'member:guest': 'guest',

    'guest:null': null,
    'guest:admin': 'guest',
    'guest:contributor': 'guest',
    'guest:commenter': 'guest',
    'guest:guest': 'guest',

    'null:null': null,
    'null:admin': null,
    'null:contributor': null,
    'null:commenter': null,
    'null:guest': null,
  };

  it('AC-03: effectiveProjectRole matches all combinations in table RQ A5', () => {
    for (const wsRole of allWorkspaceRoles) {
      for (const prRole of allProjectRoles) {
        const key = `${wsRole}:${prRole}`;
        const expected = EXPECTED_A5[key];
        const actual = effectiveProjectRole({
          workspaceRole: wsRole,
          assignedRole: prRole,
        });
        expect(actual, `Failed for ${key}`).toBe(expected);
      }
    }
  });

  it('AC-03: isProjectRoleClamped is true exactly for the ✖ cells of table RQ A5', () => {
    for (const wsRole of allWorkspaceRoles) {
      for (const prRole of allProjectRoles) {
        const clamped = isProjectRoleClamped({
          workspaceRole: wsRole,
          assignedRole: prRole,
        });
        const isExpectedClamped =
          wsRole === 'guest' &&
          (prRole === 'admin' || prRole === 'contributor' || prRole === 'commenter');

        expect(clamped, `Clamp check failed for ${wsRole}:${prRole}`).toBe(
          isExpectedClamped,
        );
      }
    }
  });

  it('AC-03: resolveProjectAccess returns effective role + full permissions, or null', () => {
    const samplePermissions: ProjectRolePermissions = {
      admin: ['project.settings.update'],
      contributor: ['project.workitems.create'],
      commenter: ['project.comments.create'],
      guest: ['project.settings.view'],
    };

    const accessMember = resolveProjectAccess(
      {
        workspaceRole: 'member',
        assignedRole: 'contributor',
      },
      samplePermissions,
    );
    expect(accessMember).toEqual({
      role: 'contributor',
      permissions: samplePermissions.contributor,
    });

    const accessGuestClamped = resolveProjectAccess(
      {
        workspaceRole: 'guest',
        assignedRole: 'admin',
      },
      samplePermissions,
    );
    expect(accessGuestClamped).toEqual({
      role: 'guest',
      permissions: samplePermissions.guest,
    });

    const accessNoWs = resolveProjectAccess(
      {
        workspaceRole: null,
        assignedRole: 'admin',
      },
      samplePermissions,
    );
    expect(accessNoWs).toBeNull();

    const accessMemberUnassigned = resolveProjectAccess(
      {
        workspaceRole: 'member',
        assignedRole: null,
      },
      samplePermissions,
    );
    expect(accessMemberUnassigned).toBeNull();
  });
});
