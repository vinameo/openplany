import { describe, expect, it } from 'vitest';
import {
  assignableProjectRoles,
  assignableWorkspaceRoles,
  canRemoveProjectMember,
  canRemoveWorkspaceMember,
  projectRolesAboveCeiling,
} from './roleAssignment.js';
import type { WorkspaceRole } from './workspace.js';
import type { ProjectRole } from './projectRoles.js';

describe('roleAssignment', () => {
  describe('AC-04: assignableWorkspaceRoles', () => {
    it('matches rules for all actor and target role combinations', () => {
      const actorId = 'actor-user';
      const targetId = 'target-user';

      // Admin actor with role update permission
      const adminActor = {
        userId: actorId,
        role: 'admin' as WorkspaceRole,
        permissions: ['workspace.members.role.update' as const],
      };

      expect(
        assignableWorkspaceRoles(adminActor, { userId: targetId, role: 'admin' }),
      ).toEqual(['admin', 'member', 'guest']);
      expect(
        assignableWorkspaceRoles(adminActor, { userId: targetId, role: 'member' }),
      ).toEqual(['admin', 'member', 'guest']);
      expect(
        assignableWorkspaceRoles(adminActor, { userId: targetId, role: 'guest' }),
      ).toEqual(['admin', 'member', 'guest']);

      // Admin actor without permission
      const adminNoPermActor = {
        userId: actorId,
        role: 'admin' as WorkspaceRole,
        permissions: [],
      };
      expect(
        assignableWorkspaceRoles(adminNoPermActor, { userId: targetId, role: 'member' }),
      ).toEqual([]);

      // Member actor (lacks permission by default)
      const memberActor = {
        userId: actorId,
        role: 'member' as WorkspaceRole,
        permissions: [],
      };
      for (const targetRole of ['admin', 'member', 'guest'] as WorkspaceRole[]) {
        expect(
          assignableWorkspaceRoles(memberActor, { userId: targetId, role: targetRole }),
        ).toEqual([]);
      }

      // Guest actor
      const guestActor = {
        userId: actorId,
        role: 'guest' as WorkspaceRole,
        permissions: [],
      };
      for (const targetRole of ['admin', 'member', 'guest'] as WorkspaceRole[]) {
        expect(
          assignableWorkspaceRoles(guestActor, { userId: targetId, role: targetRole }),
        ).toEqual([]);
      }
    });

    it('returns empty array when actor targets self', () => {
      const sameId = 'user-1';
      expect(
        assignableWorkspaceRoles(
          { userId: sameId, role: 'admin', permissions: ['workspace.members.role.update'] },
          { userId: sameId, role: 'admin' },
        ),
      ).toEqual([]);
    });

    it('canRemoveWorkspaceMember allows admin to remove members/guests/admins but not self', () => {
      const admin = {
        userId: 'admin-1',
        role: 'admin' as WorkspaceRole,
        permissions: ['workspace.members.remove' as const],
      };
      expect(canRemoveWorkspaceMember(admin, { userId: 'admin-2', role: 'admin' })).toBe(true);
      expect(canRemoveWorkspaceMember(admin, { userId: 'member-1', role: 'member' })).toBe(true);
      expect(canRemoveWorkspaceMember(admin, { userId: 'guest-1', role: 'guest' })).toBe(true);
      expect(canRemoveWorkspaceMember(admin, { userId: 'admin-1', role: 'admin' })).toBe(false);

      const member = {
        userId: 'member-1',
        role: 'member' as WorkspaceRole,
        permissions: [],
      };
      expect(canRemoveWorkspaceMember(member, { userId: 'member-2', role: 'member' })).toBe(false);
    });
  });

  describe('AC-06: assignableProjectRoles and canRemoveProjectMember', () => {
    const allProjectRoles: ProjectRole[] = ['admin', 'contributor', 'commenter', 'guest'];

    it('matches RQ B8.2 rules for project role assignment and removal', () => {
      const adminWsActor = {
        userId: 'actor-admin',
        workspaceRole: 'admin' as WorkspaceRole,
        effectiveRole: 'admin' as ProjectRole,
        permissions: ['project.members.manage' as const],
      };

      const memberAdminActor = {
        userId: 'actor-member-pa',
        workspaceRole: 'member' as WorkspaceRole,
        effectiveRole: 'admin' as ProjectRole,
        permissions: ['project.members.manage' as const],
      };

      const contributorActor = {
        userId: 'actor-contrib',
        workspaceRole: 'member' as WorkspaceRole,
        effectiveRole: 'contributor' as ProjectRole,
        permissions: [],
      };

      // 1. Target is Member workspace, not yet project member (assignedRole: null)
      expect(
        assignableProjectRoles(adminWsActor, {
          userId: 'target-1',
          workspaceRole: 'member',
          assignedRole: null,
        }),
      ).toEqual(allProjectRoles);
      expect(
        canRemoveProjectMember(adminWsActor, {
          userId: 'target-1',
          workspaceRole: 'member',
          assignedRole: null,
        }),
      ).toBe(false);

      // 2. Target is Member workspace, Project Admin
      expect(
        assignableProjectRoles(adminWsActor, {
          userId: 'target-pa',
          workspaceRole: 'member',
          assignedRole: 'admin',
        }),
      ).toEqual(allProjectRoles);
      expect(
        canRemoveProjectMember(adminWsActor, {
          userId: 'target-pa',
          workspaceRole: 'member',
          assignedRole: 'admin',
        }),
      ).toBe(true);

      // Member workspace Project Admin actor vs another Member workspace Project Admin (Q-R14)
      expect(
        assignableProjectRoles(memberAdminActor, {
          userId: 'target-pa',
          workspaceRole: 'member',
          assignedRole: 'admin',
        }),
      ).toEqual([]);
      expect(
        canRemoveProjectMember(memberAdminActor, {
          userId: 'target-pa',
          workspaceRole: 'member',
          assignedRole: 'admin',
        }),
      ).toBe(false);

      // Member workspace Project Admin actor vs Member workspace Contributor
      expect(
        assignableProjectRoles(memberAdminActor, {
          userId: 'target-contrib',
          workspaceRole: 'member',
          assignedRole: 'contributor',
        }),
      ).toEqual(allProjectRoles);
      expect(
        canRemoveProjectMember(memberAdminActor, {
          userId: 'target-contrib',
          workspaceRole: 'member',
          assignedRole: 'contributor',
        }),
      ).toBe(true);

      // 3. Target is Guest workspace (Q-R16)
      expect(
        assignableProjectRoles(adminWsActor, {
          userId: 'target-guest',
          workspaceRole: 'guest',
          assignedRole: 'guest',
        }),
      ).toEqual(['guest']);
      expect(
        assignableProjectRoles(memberAdminActor, {
          userId: 'target-guest',
          workspaceRole: 'guest',
          assignedRole: null,
        }),
      ).toEqual(['guest']);
      expect(
        canRemoveProjectMember(memberAdminActor, {
          userId: 'target-guest',
          workspaceRole: 'guest',
          assignedRole: 'guest',
        }),
      ).toBe(true);

      // 4. Target is Admin workspace (implicit project role admin)
      expect(
        assignableProjectRoles(adminWsActor, {
          userId: 'target-admin-ws',
          workspaceRole: 'admin',
          assignedRole: 'admin',
        }),
      ).toEqual([]);
      expect(
        canRemoveProjectMember(adminWsActor, {
          userId: 'target-admin-ws',
          workspaceRole: 'admin',
          assignedRole: 'admin',
        }),
      ).toBe(false);

      // 5. Self assignment
      expect(
        assignableProjectRoles(adminWsActor, {
          userId: 'actor-admin',
          workspaceRole: 'admin',
          assignedRole: 'admin',
        }),
      ).toEqual([]);
      expect(
        canRemoveProjectMember(adminWsActor, {
          userId: 'actor-admin',
          workspaceRole: 'admin',
          assignedRole: 'admin',
        }),
      ).toBe(false);

      // 6. Actor lacks project.members.manage
      expect(
        assignableProjectRoles(contributorActor, {
          userId: 'target-1',
          workspaceRole: 'member',
          assignedRole: null,
        }),
      ).toEqual([]);
      expect(
        canRemoveProjectMember(contributorActor, {
          userId: 'target-1',
          workspaceRole: 'member',
          assignedRole: 'contributor',
        }),
      ).toBe(false);
    });
  });

  describe('AC-20: projectRolesAboveCeiling', () => {
    it('returns roles above ceiling for given workspace role', () => {
      expect(projectRolesAboveCeiling('guest')).toEqual([
        'admin',
        'contributor',
        'commenter',
      ]);
      expect(projectRolesAboveCeiling('admin')).toEqual([]);
      expect(projectRolesAboveCeiling('member')).toEqual([]);
    });
  });
});
