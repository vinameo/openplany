import { describe, expect, it } from "vitest";
import {
  ADD_PROJECT_MEMBERS_REQUIREMENT,
  canAddProjectMembers,
  PROJECT_MEMBER_LIST_MAX,
  PROJECT_MEMBER_NOT_ADDABLE_FIELD,
  PROJECT_MEMBER_NOT_ADDABLE_MESSAGES,
  PROJECT_MEMBER_NOT_ADDABLE_REASONS,
  projectRoleChangeKind,
  PROJECT_ROLE_CHANGE_MESSAGES,
} from "./projectMembers.js";

describe("projectMembers contracts", () => {
  it("defines PROJECT_MEMBER_LIST_MAX as 1000", () => {
    expect(PROJECT_MEMBER_LIST_MAX).toBe(1000);
  });

  it("defines ADD_PROJECT_MEMBERS_REQUIREMENT with exact permissions", () => {
    expect(ADD_PROJECT_MEMBERS_REQUIREMENT).toEqual({
      project: "project.members.manage",
      workspace: "workspace.members.view",
    });
  });

  it("canAddProjectMembers requires both project.members.manage and workspace.members.view", () => {
    expect(canAddProjectMembers([], [])).toBe(false);
    expect(canAddProjectMembers(["project.members.manage"], [])).toBe(false);
    expect(canAddProjectMembers([], ["workspace.members.view"])).toBe(false);
    expect(
      canAddProjectMembers(
        ["project.members.manage"],
        ["workspace.members.view"],
      ),
    ).toBe(true);
    expect(
      canAddProjectMembers(
        ["project.members.manage", "project.settings.view"],
        ["workspace.members.view", "workspace.members.add"],
      ),
    ).toBe(true);
  });

  it("maps every not-addable reason to correct field and message", () => {
    expect(PROJECT_MEMBER_NOT_ADDABLE_REASONS).toEqual([
      "unavailable",
      "not_in_workspace",
      "workspace_admin",
      "already_member",
      "role_not_allowed",
    ]);

    for (const reason of PROJECT_MEMBER_NOT_ADDABLE_REASONS) {
      expect(PROJECT_MEMBER_NOT_ADDABLE_FIELD[reason]).toBeDefined();
      expect(PROJECT_MEMBER_NOT_ADDABLE_MESSAGES[reason]).toBeDefined();
    }

    expect(PROJECT_MEMBER_NOT_ADDABLE_FIELD.role_not_allowed).toBe("role");
    expect(PROJECT_MEMBER_NOT_ADDABLE_FIELD.already_member).toBe("userId");
    expect(PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.role_not_allowed).toBe(
      "This role isn't allowed for their workspace role.",
    );
  });

  it("correctly classifies projectRoleChangeKind for all role pairs", () => {
    const roles = ["admin", "contributor", "commenter", "viewer"] as const;

    for (const from of roles) {
      for (const to of roles) {
        const kind = projectRoleChangeKind(from, to);
        if (from !== "admin" && to === "admin") {
          expect(kind).toBe("gain_admin");
        } else if (from === "admin" && to !== "admin") {
          expect(kind).toBe("lose_admin");
        } else {
          expect(kind).toBe("other");
        }
      }
    }
  });

  it("exports PROJECT_ROLE_CHANGE_MESSAGES with exact text from spec", () => {
    expect(PROJECT_ROLE_CHANGE_MESSAGES).toEqual({
      cantChange: "You can't change this person's role",
      inherited: "Workspace Admins are Project Admins in every project.",
      memberGone: "This person is no longer in this project.",
    });
  });
});
