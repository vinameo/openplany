import { describe, expect, it } from "vitest";
import {
  assignableRangeOf,
  hasImplicitProjectAccess,
  projectCreatorMembershipRole,
  validateProjectAccessPolicies,
  workspaceRolesWithImplicitProjectAccess,
  type ProjectAccessPolicy,
} from "./projectAccessPolicy.js";
import { DEFAULT_PROJECT_ACCESS_POLICIES } from "./testing.js";

describe("projectAccessPolicy", () => {
  it("hasImplicitProjectAccess is true only when implicitProjectRole is not null", () => {
    expect(
      hasImplicitProjectAccess(DEFAULT_PROJECT_ACCESS_POLICIES.admin),
    ).toBe(true);
    expect(
      hasImplicitProjectAccess(DEFAULT_PROJECT_ACCESS_POLICIES.member),
    ).toBe(false);
    expect(
      hasImplicitProjectAccess(DEFAULT_PROJECT_ACCESS_POLICIES.guest),
    ).toBe(false);
  });

  it("workspaceRolesWithImplicitProjectAccess returns workspace roles with implicit role", () => {
    expect(
      workspaceRolesWithImplicitProjectAccess(DEFAULT_PROJECT_ACCESS_POLICIES),
    ).toEqual(["admin"]);
  });

  it("assignableRangeOf returns empty array for roles with implicit access and rank range otherwise", () => {
    expect(assignableRangeOf(DEFAULT_PROJECT_ACCESS_POLICIES.admin)).toEqual(
      [],
    );
    expect(assignableRangeOf(DEFAULT_PROJECT_ACCESS_POLICIES.member)).toEqual([
      "admin",
      "contributor",
      "commenter",
    ]);
    expect(assignableRangeOf(DEFAULT_PROJECT_ACCESS_POLICIES.guest)).toEqual([
      "viewer",
    ]);
  });

  it("projectCreatorMembershipRole returns null when implicit role exists, otherwise creator role or highest", () => {
    expect(
      projectCreatorMembershipRole(DEFAULT_PROJECT_ACCESS_POLICIES.admin),
    ).toBeNull();
    expect(
      projectCreatorMembershipRole(DEFAULT_PROJECT_ACCESS_POLICIES.member),
    ).toBe("admin");

    const customMemberPolicy: ProjectAccessPolicy = {
      workspaceRole: "member",
      implicitProjectRole: null,
      lowestAssignableRole: "viewer",
      highestAssignableRole: "contributor",
      overridesProjectRank: false,
    };
    expect(projectCreatorMembershipRole(customMemberPolicy)).toBe(
      "contributor",
    );
  });

  describe("validateProjectAccessPolicies", () => {
    it("returns null for DEFAULT_PROJECT_ACCESS_POLICIES", () => {
      const rows = Object.values(DEFAULT_PROJECT_ACCESS_POLICIES);
      expect(validateProjectAccessPolicies(rows)).toBeNull();
    });

    it("rejects non-array input", () => {
      expect(
        validateProjectAccessPolicies(null as unknown as ProjectAccessPolicy[]),
      ).toBe("Expected an array of project access policies");
    });

    it("rejects invalid row objects", () => {
      expect(
        validateProjectAccessPolicies([null as unknown as ProjectAccessPolicy]),
      ).toBe("Policy row must be an object");
    });

    it("rejects unknown workspace role", () => {
      const rows = [
        {
          workspaceRole: "superadmin" as unknown,
          implicitProjectRole: null,
          lowestAssignableRole: "viewer",
          highestAssignableRole: "admin",
          overridesProjectRank: false,
        } as ProjectAccessPolicy,
      ];
      expect(validateProjectAccessPolicies(rows)).toContain(
        "Unknown workspace role: superadmin",
      );
    });

    it("rejects duplicate workspace roles", () => {
      const rows = [
        DEFAULT_PROJECT_ACCESS_POLICIES.admin,
        DEFAULT_PROJECT_ACCESS_POLICIES.admin,
      ];
      expect(validateProjectAccessPolicies(rows)).toContain(
        "Duplicate policy for workspace role: admin",
      );
    });

    it("rejects unknown implicit project role", () => {
      const rows = [
        {
          ...DEFAULT_PROJECT_ACCESS_POLICIES.admin,
          implicitProjectRole: "owner" as unknown,
          lowestAssignableRole: "owner" as unknown,
          highestAssignableRole: "owner" as unknown,
        } as ProjectAccessPolicy,
        DEFAULT_PROJECT_ACCESS_POLICIES.member,
        DEFAULT_PROJECT_ACCESS_POLICIES.guest,
      ];
      expect(validateProjectAccessPolicies(rows)).toContain(
        "Unknown implicit project role: owner",
      );
    });

    it("rejects unknown lowest assignable role", () => {
      const rows = [
        DEFAULT_PROJECT_ACCESS_POLICIES.admin,
        {
          ...DEFAULT_PROJECT_ACCESS_POLICIES.member,
          lowestAssignableRole: "invalid" as unknown,
        } as ProjectAccessPolicy,
        DEFAULT_PROJECT_ACCESS_POLICIES.guest,
      ];
      expect(validateProjectAccessPolicies(rows)).toContain(
        "Unknown lowest assignable role: invalid",
      );
    });

    it("rejects unknown highest assignable role", () => {
      const rows = [
        DEFAULT_PROJECT_ACCESS_POLICIES.admin,
        {
          ...DEFAULT_PROJECT_ACCESS_POLICIES.member,
          highestAssignableRole: "invalid" as unknown,
        } as ProjectAccessPolicy,
        DEFAULT_PROJECT_ACCESS_POLICIES.guest,
      ];
      expect(validateProjectAccessPolicies(rows)).toContain(
        "Unknown highest assignable role: invalid",
      );
    });

    it("rejects when lowest rank is greater than highest rank", () => {
      const rows = [
        DEFAULT_PROJECT_ACCESS_POLICIES.admin,
        {
          ...DEFAULT_PROJECT_ACCESS_POLICIES.member,
          lowestAssignableRole: "admin",
          highestAssignableRole: "viewer",
        } as ProjectAccessPolicy,
        DEFAULT_PROJECT_ACCESS_POLICIES.guest,
      ];
      expect(validateProjectAccessPolicies(rows)).toContain(
        "cannot have higher rank than highest",
      );
    });

    it("rejects implicit role with different lowest or highest role", () => {
      const rows = [
        {
          ...DEFAULT_PROJECT_ACCESS_POLICIES.admin,
          lowestAssignableRole: "viewer",
          highestAssignableRole: "admin",
        } as ProjectAccessPolicy,
        DEFAULT_PROJECT_ACCESS_POLICIES.member,
        DEFAULT_PROJECT_ACCESS_POLICIES.guest,
      ];
      expect(validateProjectAccessPolicies(rows)).toContain(
        "must have lowest and highest role equal to implicit role",
      );
    });

    it("rejects missing workspace role", () => {
      const rows = [
        DEFAULT_PROJECT_ACCESS_POLICIES.admin,
        DEFAULT_PROJECT_ACCESS_POLICIES.member,
      ];
      expect(validateProjectAccessPolicies(rows)).toBe(
        "Missing policy for workspace role: guest",
      );
    });
  });
});
