import { describe, expect, it } from 'vitest';
import {
  assignableProjectRoles,
  assignableWorkspaceRoles,
  canRemoveProjectMember,
  canTransferOwnershipTo,
  projectRolesAboveCeiling,
} from './roleAssignment.js';
import type { WorkspaceRole } from './workspace.js';
import type { ProjectRole } from './projectRoles.js';

describe('roleAssignment', () => {
  describe('AC-04: assignableWorkspaceRoles', () => {
    it('matches RQ B8.1 table for all actor and target role combinations', () => {
      const actorId = 'actor-user';
      const targetId = 'target-user';

      // Owner actor
      expect(
        assignableWorkspaceRoles(
          { userId: actorId, role: 'owner' },
          { userId: targetId, role: 'admin' },
        ),
      ).toEqual(['admin', 'member', 'guest']);
      expect(
        assignableWorkspaceRoles(
          { userId: actorId, role: 'owner' },
          { userId: targetId, role: 'member' },
        ),
      ).toEqual(['admin', 'member', 'guest']);
      expect(
        assignableWorkspaceRoles(
          { userId: actorId, role: 'owner' },
          { userId: targetId, role: 'guest' },
        ),
      ).toEqual(['admin', 'member', 'guest']);

      // Admin actor
      expect(
        assignableWorkspaceRoles(
          { userId: actorId, role: 'admin' },
          { userId: targetId, role: 'owner' },
        ),
      ).toEqual([]);
      expect(
        assignableWorkspaceRoles(
          { userId: actorId, role: 'admin' },
          { userId: targetId, role: 'admin' },
        ),
      ).toEqual([]);
      expect(
        assignableWorkspaceRoles(
          { userId: actorId, role: 'admin' },
          { userId: targetId, role: 'member' },
        ),
      ).toEqual(['admin', 'member', 'guest']);
      expect(
        assignableWorkspaceRoles(
          { userId: actorId, role: 'admin' },
          { userId: targetId, role: 'guest' },
        ),
      ).toEqual(['admin', 'member', 'guest']);

      // Member actor
      for (const targetRole of ['owner', 'admin', 'member', 'guest'] as WorkspaceRole[]) {
        expect(
          assignableWorkspaceRoles(
            { userId: actorId, role: 'member' },
            { userId: targetId, role: targetRole },
          ),
        ).toEqual([]);
      }

      // Guest actor
      for (const targetRole of ['owner', 'admin', 'member', 'guest'] as WorkspaceRole[]) {
        expect(
          assignableWorkspaceRoles(
            { userId: actorId, role: 'guest' },
            { userId: targetId, role: targetRole },
          ),
        ).toEqual([]);
      }
    });

    it('returns empty array when actor targets self', () => {
      const sameId = 'user-1';
      expect(
        assignableWorkspaceRoles(
          { userId: sameId, role: 'owner' },
          { userId: sameId, role: 'owner' },
        ),
      ).toEqual([]);
      expect(
        assignableWorkspaceRoles(
          { userId: sameId, role: 'admin' },
          { userId: sameId, role: 'admin' },
        ),
      ).toEqual([]);
    });

    it('never contains owner in assignable workspace roles', () => {
      const roles = assignableWorkspaceRoles(
        { userId: 'u1', role: 'owner' },
        { userId: 'u2', role: 'member' },
      );
      expect(roles).not.toContain('owner');
    });
  });

  describe('AC-05: canTransferOwnershipTo', () => {
    it('allows Owner to transfer ownership to another admin or member only', () => {
      const owner = { userId: 'owner-id', role: 'owner' as WorkspaceRole };
      const admin = { userId: 'admin-id', role: 'admin' as WorkspaceRole };
      const member = { userId: 'member-id', role: 'member' as WorkspaceRole };
      const guest = { userId: 'guest-id', role: 'guest' as WorkspaceRole };

      expect(canTransferOwnershipTo(owner, admin)).toBe(true);
      expect(canTransferOwnershipTo(owner, member)).toBe(true);
      expect(canTransferOwnershipTo(owner, guest)).toBe(false);
      expect(canTransferOwnershipTo(owner, { userId: 'owner-id', role: 'owner' })).toBe(false);

      // Non-owner actor cannot transfer ownership
      expect(canTransferOwnershipTo(admin, member)).toBe(false);
      expect(canTransferOwnershipTo(member, admin)).toBe(false);
      expect(canTransferOwnershipTo(guest, admin)).toBe(false);
    });
  });

  describe('AC-06: assignableProjectRoles and canRemoveProjectMember', () => {
    const allProjectRoles: ProjectRole[] = ['admin', 'contributor', 'commenter', 'guest'];

    it('matches RQ B8.2 rules for project role assignment and removal', () => {
      const ownerWsActor = {
        userId: 'actor-owner',
        workspaceRole: 'owner' as WorkspaceRole,
        effectiveRole: 'admin' as ProjectRole,
      };

      const memberAdminActor = {
        userId: 'actor-member-pa',
        workspaceRole: 'member' as WorkspaceRole,
        effectiveRole: 'admin' as ProjectRole,
      };

      const contributorActor = {
        userId: 'actor-contrib',
        workspaceRole: 'member' as WorkspaceRole,
        effectiveRole: 'contributor' as ProjectRole,
      };

      // 1. Target is Member workspace, not yet project member (assignedRole: null)
      expect(
        assignableProjectRoles(ownerWsActor, {
          userId: 'target-1',
          workspaceRole: 'member',
          assignedRole: null,
        }),
      ).toEqual(allProjectRoles);
      expect(
        canRemoveProjectMember(ownerWsActor, {
          userId: 'target-1',
          workspaceRole: 'member',
          assignedRole: null,
        }),
      ).toBe(false);

      // 2. Target is Member workspace, Project Admin
      expect(
        assignableProjectRoles(ownerWsActor, {
          userId: 'target-pa',
          workspaceRole: 'member',
          assignedRole: 'admin',
        }),
      ).toEqual(allProjectRoles);
      expect(
        canRemoveProjectMember(ownerWsActor, {
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
        assignableProjectRoles(ownerWsActor, {
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

      // 4. Target is Owner/Admin workspace
      expect(
        assignableProjectRoles(ownerWsActor, {
          userId: 'target-admin-ws',
          workspaceRole: 'admin',
          assignedRole: 'admin',
        }),
      ).toEqual([]);
      expect(
        canRemoveProjectMember(ownerWsActor, {
          userId: 'target-admin-ws',
          workspaceRole: 'admin',
          assignedRole: 'admin',
        }),
      ).toBe(false);

      // 5. Self assignment
      expect(
        assignableProjectRoles(ownerWsActor, {
          userId: 'actor-owner',
          workspaceRole: 'owner',
          assignedRole: 'admin',
        }),
      ).toEqual([]);
      expect(
        canRemoveProjectMember(ownerWsActor, {
          userId: 'actor-owner',
          workspaceRole: 'owner',
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
      expect(projectRolesAboveCeiling('owner')).toEqual([]);
      expect(projectRolesAboveCeiling('admin')).toEqual([]);
      expect(projectRolesAboveCeiling('member')).toEqual([]);
    });
  });
});
