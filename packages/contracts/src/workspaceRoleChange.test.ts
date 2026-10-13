import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_ACCESS_POLICIES } from './testing.js';
import {
  planWorkspaceRoleChange,
  resolveAppliedProjectRole,
  type WorkspaceRoleChangePlan,
} from './workspaceRoleChange.js';

describe('workspaceRoleChange', () => {
  const policies = DEFAULT_PROJECT_ACCESS_POLICIES;

  describe('planWorkspaceRoleChange', () => {
    it('sets effect to gain_implicit when toRole has implicit project access (e.g. member -> admin)', () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: 'admin' },
          fromRole: 'member',
          toRole: 'admin',
          liveProjectCount: 3,
        },
        policies,
      );

      expect(plan.effect).toBe('gain_implicit');
      expect(plan.projectRoleChoices).toEqual([]);
      expect(plan.defaultProjectRole).toBeNull();
      expect(plan.actorCanChooseProjectRole).toBe(true);
    });

    it('sets effect to lose_implicit when fromRole has implicit project access (e.g. admin -> member)', () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: 'admin' },
          fromRole: 'admin',
          toRole: 'member',
          liveProjectCount: 3,
        },
        policies,
      );

      expect(plan.effect).toBe('lose_implicit');
      expect(plan.projectRoleChoices).toEqual([]);
      expect(plan.defaultProjectRole).toBe('commenter'); // lowest assignable of member
      expect(plan.actorCanChooseProjectRole).toBe(true);
    });

    it('sets effect to no_projects when liveProjectCount is 0 between non-implicit roles (guest -> member)', () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: 'admin' },
          fromRole: 'guest',
          toRole: 'member',
          liveProjectCount: 0,
        },
        policies,
      );

      expect(plan.effect).toBe('no_projects');
      expect(plan.projectRoleChoices).toEqual([]);
      expect(plan.defaultProjectRole).toBe('commenter');
      expect(plan.actorCanChooseProjectRole).toBe(true);
    });

    it('sets effect to apply_project_role with choices when actor is admin and liveProjectCount > 0 (guest -> member)', () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: 'admin' },
          fromRole: 'guest',
          toRole: 'member',
          liveProjectCount: 2,
        },
        policies,
      );

      expect(plan.effect).toBe('apply_project_role');
      expect(plan.actorCanChooseProjectRole).toBe(true);
      expect(plan.projectRoleChoices).toEqual([
        'admin',
        'contributor',
        'commenter',
      ]);
      expect(plan.defaultProjectRole).toBe('commenter');
    });

    it('restricts choices to only lowest role when actor is not admin (e.g. actor is member)', () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: 'member' },
          fromRole: 'guest',
          toRole: 'member',
          liveProjectCount: 2,
        },
        policies,
      );

      expect(plan.effect).toBe('apply_project_role');
      expect(plan.actorCanChooseProjectRole).toBe(false);
      expect(plan.projectRoleChoices).toEqual(['commenter']);
      expect(plan.defaultProjectRole).toBe('commenter');
    });

    it('member -> guest sets choices to [viewer] when actor is admin', () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: 'admin' },
          fromRole: 'member',
          toRole: 'guest',
          liveProjectCount: 2,
        },
        policies,
      );

      expect(plan.effect).toBe('apply_project_role');
      expect(plan.actorCanChooseProjectRole).toBe(true);
      expect(plan.projectRoleChoices).toEqual(['viewer']);
      expect(plan.defaultProjectRole).toBe('viewer');
    });
  });

  describe('resolveAppliedProjectRole', () => {
    it('returns role: null when toPolicy has implicit project access', () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: 'gain_implicit',
        projectRoleChoices: [],
        defaultProjectRole: null,
        actorCanChooseProjectRole: true,
      };

      const result = resolveAppliedProjectRole(
        plan,
        policies.admin,
        'contributor',
      );
      expect(result).toEqual({ ok: true, role: null });
    });

    it('defaults to lowestAssignableRole when requested role is null or undefined', () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: 'apply_project_role',
        projectRoleChoices: ['admin', 'contributor', 'commenter'],
        defaultProjectRole: 'commenter',
        actorCanChooseProjectRole: true,
      };

      expect(resolveAppliedProjectRole(plan, policies.member, null)).toEqual({
        ok: true,
        role: 'commenter',
      });
      expect(
        resolveAppliedProjectRole(plan, policies.member, undefined),
      ).toEqual({
        ok: true,
        role: 'commenter',
      });
    });

    it('returns out_of_range when requested role is not allowed for the new workspace role', () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: 'apply_project_role',
        projectRoleChoices: ['viewer'],
        defaultProjectRole: 'viewer',
        actorCanChooseProjectRole: true,
      };

      // guest can only have 'viewer'; 'commenter' is out of range
      const result = resolveAppliedProjectRole(
        plan,
        policies.guest,
        'commenter',
      );
      expect(result).toEqual({ ok: false, reason: 'out_of_range' });
    });

    it('returns actor_cannot_choose when non-admin actor requests role other than lowestAssignableRole', () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: 'apply_project_role',
        projectRoleChoices: ['commenter'],
        defaultProjectRole: 'commenter',
        actorCanChooseProjectRole: false,
      };

      const result = resolveAppliedProjectRole(
        plan,
        policies.member,
        'contributor',
      );
      expect(result).toEqual({ ok: false, reason: 'actor_cannot_choose' });
    });

    it('accepts lowestAssignableRole even if actor cannot choose', () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: 'apply_project_role',
        projectRoleChoices: ['commenter'],
        defaultProjectRole: 'commenter',
        actorCanChooseProjectRole: false,
      };

      const result = resolveAppliedProjectRole(
        plan,
        policies.member,
        'commenter',
      );
      expect(result).toEqual({ ok: true, role: 'commenter' });
    });

    it('accepts valid requested role when actor is admin', () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: 'apply_project_role',
        projectRoleChoices: ['admin', 'contributor', 'commenter'],
        defaultProjectRole: 'commenter',
        actorCanChooseProjectRole: true,
      };

      const result = resolveAppliedProjectRole(
        plan,
        policies.member,
        'contributor',
      );
      expect(result).toEqual({ ok: true, role: 'contributor' });
    });
  });
});
