import { describe, expect, it } from 'vitest';
import { WORKSPACE_ROLES, type WorkspaceRole } from './workspace.js';
import { PROJECT_ROLES, type ProjectRole } from './projectRoles.js';
import { projectPermissionsOf } from './projectPermissions.js';
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
  // | owner                | admin| admin | admin       | admin     | admin |
  // | admin                | admin| admin | admin       | admin     | admin |
  // | member               | null | admin | contributor | commenter | guest |
  // | guest                | null | guest | guest       | guest     | guest |
  // | null                 | null | null  | null        | null      | null  |
  const EXPECTED_A5: Record<string, ProjectRole | null> = {
    'owner:null': 'admin',
    'owner:admin': 'admin',
    'owner:contributor': 'admin',
    'owner:commenter': 'admin',
    'owner:guest': 'admin',

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

  it('AC-03: effectiveProjectRole matches all 5x5 combinations in table RQ A5', () => {
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
    const accessMember = resolveProjectAccess({
      workspaceRole: 'member',
      assignedRole: 'contributor',
    });
    expect(accessMember).toEqual({
      role: 'contributor',
      permissions: projectPermissionsOf('contributor'),
    });

    const accessGuestClamped = resolveProjectAccess({
      workspaceRole: 'guest',
      assignedRole: 'admin',
    });
    expect(accessGuestClamped).toEqual({
      role: 'guest',
      permissions: projectPermissionsOf('guest'),
    });

    const accessNoWs = resolveProjectAccess({
      workspaceRole: null,
      assignedRole: 'admin',
    });
    expect(accessNoWs).toBeNull();

    const accessMemberUnassigned = resolveProjectAccess({
      workspaceRole: 'member',
      assignedRole: null,
    });
    expect(accessMemberUnassigned).toBeNull();
  });
});
