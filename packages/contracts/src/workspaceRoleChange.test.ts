import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ACCESS_POLICIES } from "./testing.js";
import {
  checkWorkspaceRoleChange,
  mayRemoveAssignedProjectAdmin,
  planWorkspaceRoleChange,
  projectRoleAppliedBy,
  resolveAppliedProjectRole,
  type WorkspaceRoleChangePlan,
} from "./workspaceRoleChange.js";

describe("workspaceRoleChange", () => {
  const policies = DEFAULT_PROJECT_ACCESS_POLICIES;

  describe("planWorkspaceRoleChange", () => {
    it("sets effect to gain_implicit when toRole has implicit project access (e.g. member -> admin)", () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: "admin" },
          fromRole: "member",
          toRole: "admin",
          liveProjectCount: 3,
        },
        policies,
      );

      expect(plan.effect).toBe("gain_implicit");
      expect(plan.projectRoleChoices).toEqual([]);
      expect(plan.defaultProjectRole).toBeNull();
      expect(plan.actorCanChooseProjectRole).toBe(true);
    });

    it("sets effect to lose_implicit when fromRole has implicit project access (e.g. admin -> member)", () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: "admin" },
          fromRole: "admin",
          toRole: "member",
          liveProjectCount: 3,
        },
        policies,
      );

      expect(plan.effect).toBe("lose_implicit");
      expect(plan.projectRoleChoices).toEqual([]);
      expect(plan.defaultProjectRole).toBe("commenter"); // lowest assignable of member
      expect(plan.actorCanChooseProjectRole).toBe(true);
    });

    it("sets effect to no_projects when liveProjectCount is 0 between non-implicit roles (guest -> member)", () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: "admin" },
          fromRole: "guest",
          toRole: "member",
          liveProjectCount: 0,
        },
        policies,
      );

      expect(plan.effect).toBe("no_projects");
      expect(plan.projectRoleChoices).toEqual([]);
      expect(plan.defaultProjectRole).toBe("commenter");
      expect(plan.actorCanChooseProjectRole).toBe(true);
    });

    it("sets effect to apply_project_role with choices when actor is admin and liveProjectCount > 0 (guest -> member)", () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: "admin" },
          fromRole: "guest",
          toRole: "member",
          liveProjectCount: 2,
        },
        policies,
      );

      expect(plan.effect).toBe("apply_project_role");
      expect(plan.actorCanChooseProjectRole).toBe(true);
      expect(plan.projectRoleChoices).toEqual([
        "admin",
        "contributor",
        "commenter",
      ]);
      expect(plan.defaultProjectRole).toBe("commenter");
    });

    it("restricts choices to only lowest role when actor is not admin (e.g. actor is member)", () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: "member" },
          fromRole: "guest",
          toRole: "member",
          liveProjectCount: 2,
        },
        policies,
      );

      expect(plan.effect).toBe("apply_project_role");
      expect(plan.actorCanChooseProjectRole).toBe(false);
      expect(plan.projectRoleChoices).toEqual(["commenter"]);
      expect(plan.defaultProjectRole).toBe("commenter");
    });

    it("member -> guest sets choices to [viewer] when actor is admin", () => {
      const plan = planWorkspaceRoleChange(
        {
          actor: { workspaceRole: "admin" },
          fromRole: "member",
          toRole: "guest",
          liveProjectCount: 2,
        },
        policies,
      );

      expect(plan.effect).toBe("apply_project_role");
      expect(plan.actorCanChooseProjectRole).toBe(true);
      expect(plan.projectRoleChoices).toEqual(["viewer"]);
      expect(plan.defaultProjectRole).toBe("viewer");
    });
  });

  describe("resolveAppliedProjectRole", () => {
    it("returns role: null when toPolicy has implicit project access", () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: "gain_implicit",
        projectRoleChoices: [],
        defaultProjectRole: null,
        actorCanChooseProjectRole: true,
      };

      const result = resolveAppliedProjectRole(
        plan,
        policies.admin,
        "contributor",
      );
      expect(result).toEqual({ ok: true, role: null });
    });

    it("defaults to lowestAssignableRole when requested role is null or undefined", () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: "apply_project_role",
        projectRoleChoices: ["admin", "contributor", "commenter"],
        defaultProjectRole: "commenter",
        actorCanChooseProjectRole: true,
      };

      expect(resolveAppliedProjectRole(plan, policies.member, null)).toEqual({
        ok: true,
        role: "commenter",
      });
      expect(
        resolveAppliedProjectRole(plan, policies.member, undefined),
      ).toEqual({
        ok: true,
        role: "commenter",
      });
    });

    it("returns out_of_range when requested role is not allowed for the new workspace role", () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: "apply_project_role",
        projectRoleChoices: ["viewer"],
        defaultProjectRole: "viewer",
        actorCanChooseProjectRole: true,
      };

      // guest can only have 'viewer'; 'commenter' is out of range
      const result = resolveAppliedProjectRole(
        plan,
        policies.guest,
        "commenter",
      );
      expect(result).toEqual({ ok: false, reason: "out_of_range" });
    });

    it("returns actor_cannot_choose when non-admin actor requests role other than lowestAssignableRole", () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: "apply_project_role",
        projectRoleChoices: ["commenter"],
        defaultProjectRole: "commenter",
        actorCanChooseProjectRole: false,
      };

      const result = resolveAppliedProjectRole(
        plan,
        policies.member,
        "contributor",
      );
      expect(result).toEqual({ ok: false, reason: "actor_cannot_choose" });
    });

    it("accepts lowestAssignableRole even if actor cannot choose", () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: "apply_project_role",
        projectRoleChoices: ["commenter"],
        defaultProjectRole: "commenter",
        actorCanChooseProjectRole: false,
      };

      const result = resolveAppliedProjectRole(
        plan,
        policies.member,
        "commenter",
      );
      expect(result).toEqual({ ok: true, role: "commenter" });
    });

    it("accepts valid requested role when actor is admin", () => {
      const plan: WorkspaceRoleChangePlan = {
        effect: "apply_project_role",
        projectRoleChoices: ["admin", "contributor", "commenter"],
        defaultProjectRole: "commenter",
        actorCanChooseProjectRole: true,
      };

      const result = resolveAppliedProjectRole(
        plan,
        policies.member,
        "contributor",
      );
      expect(result).toEqual({ ok: true, role: "contributor" });
    });
  });

  describe("checkWorkspaceRoleChange", () => {
    const admin = {
      userId: "u-admin",
      role: "admin" as const,
      permissions: ["workspace.members.role.update" as const],
    };
    const memberActor = {
      userId: "u-member",
      role: "member" as const,
      permissions: ["workspace.members.role.update" as const],
    };

    it("rejects a self-change before any other check", () => {
      expect(
        checkWorkspaceRoleChange({
          actor: admin,
          target: { userId: "u-admin", role: "admin" },
          toRole: "admin",
          fromRole: "member",
        }),
      ).toBe("actor_forbidden");
    });

    it("rejects a role the actor cannot assign before a stale fromRole", () => {
      expect(
        checkWorkspaceRoleChange({
          actor: memberActor,
          target: { userId: "u-x", role: "guest" },
          toRole: "admin",
          fromRole: "member",
        }),
      ).toBe("actor_forbidden");
    });

    it("rejects a stale fromRole before an unchanged role", () => {
      expect(
        checkWorkspaceRoleChange({
          actor: admin,
          target: { userId: "u-x", role: "guest" },
          toRole: "guest",
          fromRole: "member",
        }),
      ).toBe("role_changed");
    });

    it("rejects the current role", () => {
      expect(
        checkWorkspaceRoleChange({
          actor: admin,
          target: { userId: "u-x", role: "member" },
          toRole: "member",
        }),
      ).toBe("same_role");
    });

    it("accepts an allowed change, with or without fromRole", () => {
      const input = {
        actor: admin,
        target: { userId: "u-x", role: "member" as const },
        toRole: "guest" as const,
      };
      expect(checkWorkspaceRoleChange(input)).toBeNull();
      expect(
        checkWorkspaceRoleChange({ ...input, fromRole: "member" }),
      ).toBeNull();
    });
  });

  describe("projectRoleAppliedBy / mayRemoveAssignedProjectAdmin", () => {
    const choosable: WorkspaceRoleChangePlan = {
      effect: "apply_project_role",
      projectRoleChoices: ["admin", "contributor", "commenter"],
      defaultProjectRole: "commenter",
      actorCanChooseProjectRole: true,
    };

    it("applies the chosen role only when the actor can choose", () => {
      expect(projectRoleAppliedBy(choosable, "admin")).toBe("admin");
      expect(projectRoleAppliedBy(choosable)).toBe("commenter");
      expect(
        projectRoleAppliedBy(
          { ...choosable, actorCanChooseProjectRole: false },
          "admin",
        ),
      ).toBe("commenter");
      expect(
        projectRoleAppliedBy({ ...choosable, effect: "gain_implicit" }),
      ).toBeNull();
    });

    it("flags changes that turn rows off or offer a non-admin project role", () => {
      expect(
        mayRemoveAssignedProjectAdmin({
          ...choosable,
          effect: "gain_implicit",
        }),
      ).toBe(true);
      expect(mayRemoveAssignedProjectAdmin(choosable)).toBe(true);
      expect(
        mayRemoveAssignedProjectAdmin({
          ...choosable,
          projectRoleChoices: ["admin"],
          defaultProjectRole: "admin",
          actorCanChooseProjectRole: false,
        }),
      ).toBe(false);
      expect(
        mayRemoveAssignedProjectAdmin({ ...choosable, effect: "no_projects" }),
      ).toBe(false);
    });
  });
});
