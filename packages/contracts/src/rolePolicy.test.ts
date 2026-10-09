import { describe, expect, it } from 'vitest';
import { WORKSPACE_ROLES, WORKSPACE_ROLE_RANK } from './workspace.js';
import { PROJECT_ROLE_RANK, type ProjectRole } from './projectRoles.js';
import { projectPermissionsOf } from './projectPermissions.js';
import { workspacePermissionsOf } from './workspacePermissions.js';
import {
  PROJECT_CREATOR_ROLE,
  WORKSPACE_ROLE_POLICY,
  projectRoleCeilingOf,
  selfJoinProjectRoleOf,
  workspaceRolesWithImplicitProjectAccess,
} from './rolePolicy.js';

describe('rolePolicy', () => {
  it('AC-19: validates consistency rules PC-1 through PC-6 rule-based across all workspace roles', () => {
    const roleRankOrZero = (role: ProjectRole | null): number =>
      role === null ? 0 : PROJECT_ROLE_RANK[role];

    for (const role of WORKSPACE_ROLES) {
      const policy = WORKSPACE_ROLE_POLICY[role];

      // PC-1: implicitProjectRole (nếu khác null) <= projectRoleCeiling
      if (policy.implicitProjectRole !== null) {
        expect(
          PROJECT_ROLE_RANK[policy.implicitProjectRole],
          `PC-1 violated for ${role}`,
        ).toBeLessThanOrEqual(PROJECT_ROLE_RANK[policy.projectRoleCeiling]);
      }

      // PC-2: selfJoinProjectRole (nếu khác null) <= projectRoleCeiling
      if (policy.selfJoinProjectRole !== null) {
        expect(
          PROJECT_ROLE_RANK[policy.selfJoinProjectRole],
          `PC-2 violated for ${role}`,
        ).toBeLessThanOrEqual(PROJECT_ROLE_RANK[policy.projectRoleCeiling]);
      }

      // PC-4: overridesProjectRank = true => implicitProjectRole có quyền project.members.manage
      if (policy.overridesProjectRank) {
        expect(policy.implicitProjectRole, `PC-4 violated for ${role}`).not.toBeNull();
        const implicitPerms = projectPermissionsOf(policy.implicitProjectRole);
        expect(
          implicitPerms.includes('project.members.manage'),
          `PC-4: ${role} implicit role must have project.members.manage`,
        ).toBe(true);
      }

      // PC-5: Mọi vai trò workspace có workspace.projects.create thì PROJECT_CREATOR_ROLE <= trần của vai trò đó
      const wsPerms = workspacePermissionsOf(role);
      if (wsPerms.includes('workspace.projects.create')) {
        expect(
          PROJECT_ROLE_RANK[PROJECT_CREATOR_ROLE],
          `PC-5 violated for ${role}`,
        ).toBeLessThanOrEqual(PROJECT_ROLE_RANK[policy.projectRoleCeiling]);
      }

      // PC-6: Vai trò workspace không có workspace.projects.browse thì selfJoinProjectRole = null
      if (!wsPerms.includes('workspace.projects.browse')) {
        expect(
          policy.selfJoinProjectRole,
          `PC-6 violated for ${role}`,
        ).toBeNull();
      }
    }

    // PC-3: Đơn điệu theo rank workspace
    for (const roleA of WORKSPACE_ROLES) {
      for (const roleB of WORKSPACE_ROLES) {
        if (WORKSPACE_ROLE_RANK[roleA] > WORKSPACE_ROLE_RANK[roleB]) {
          const policyA = WORKSPACE_ROLE_POLICY[roleA];
          const policyB = WORKSPACE_ROLE_POLICY[roleB];

          expect(
            PROJECT_ROLE_RANK[policyA.projectRoleCeiling],
            `PC-3 ceiling violated: ${roleA} vs ${roleB}`,
          ).toBeGreaterThanOrEqual(PROJECT_ROLE_RANK[policyB.projectRoleCeiling]);

          expect(
            roleRankOrZero(policyA.implicitProjectRole),
            `PC-3 implicit role violated: ${roleA} vs ${roleB}`,
          ).toBeGreaterThanOrEqual(roleRankOrZero(policyB.implicitProjectRole));
        }
      }
    }
  });

  it('AC-20: validates accessor functions and constants', () => {
    expect(workspaceRolesWithImplicitProjectAccess()).toEqual(['owner', 'admin']);

    expect(selfJoinProjectRoleOf('owner')).toBe('admin');
    expect(selfJoinProjectRoleOf('admin')).toBe('admin');
    expect(selfJoinProjectRoleOf('member')).toBe('contributor');
    expect(selfJoinProjectRoleOf('guest')).toBeNull();

    expect(projectRoleCeilingOf('owner')).toBe('admin');
    expect(projectRoleCeilingOf('admin')).toBe('admin');
    expect(projectRoleCeilingOf('member')).toBe('admin');
    expect(projectRoleCeilingOf('guest')).toBe('guest');

    expect(PROJECT_CREATOR_ROLE).toBe('admin');
  });
});
