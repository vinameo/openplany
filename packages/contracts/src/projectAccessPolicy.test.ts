import { describe, expect, it } from "vitest";
import {
  LEGACY_PROJECT_ACCESS_POLICIES,
  assignableRangeOf,
  hasImplicitProjectAccess,
  projectCreatorMembershipRole,
  workspaceRolesWithImplicitProjectAccess,
  type ProjectAccessPolicy,
} from "./projectAccessPolicy.js";

describe("projectAccessPolicy", () => {
  it("hasImplicitProjectAccess is true only when implicitProjectRole is not null", () => {
    expect(hasImplicitProjectAccess(LEGACY_PROJECT_ACCESS_POLICIES.admin)).toBe(
      true,
    );
    expect(
      hasImplicitProjectAccess(LEGACY_PROJECT_ACCESS_POLICIES.member),
    ).toBe(false);
    expect(hasImplicitProjectAccess(LEGACY_PROJECT_ACCESS_POLICIES.guest)).toBe(
      false,
    );
  });

  it("workspaceRolesWithImplicitProjectAccess returns workspace roles with implicit role", () => {
    expect(
      workspaceRolesWithImplicitProjectAccess(LEGACY_PROJECT_ACCESS_POLICIES),
    ).toEqual(["admin"]);
  });

  it("assignableRangeOf returns empty array for roles with implicit access and rank range otherwise", () => {
    expect(assignableRangeOf(LEGACY_PROJECT_ACCESS_POLICIES.admin)).toEqual([]);
    expect(assignableRangeOf(LEGACY_PROJECT_ACCESS_POLICIES.member)).toEqual([
      "admin",
      "contributor",
      "commenter",
      "viewer",
    ]);
    expect(assignableRangeOf(LEGACY_PROJECT_ACCESS_POLICIES.guest)).toEqual([
      "viewer",
    ]);
  });

  it("projectCreatorMembershipRole returns null when implicit role exists, otherwise creator role or highest", () => {
    expect(
      projectCreatorMembershipRole(LEGACY_PROJECT_ACCESS_POLICIES.admin),
    ).toBeNull();
    expect(
      projectCreatorMembershipRole(LEGACY_PROJECT_ACCESS_POLICIES.member),
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
});
