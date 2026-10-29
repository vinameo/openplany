import { describe, expect, it } from "vitest";
import {
  enforcedWorkspacePermissions,
  parseWorkspacePermissions,
} from "./workspacePermissions.js";

describe("workspacePermissions", () => {
  it("API-27 / parseWorkspacePermissions: removes non-workspace names, duplicates, and preserves order", () => {
    const parsed = parseWorkspacePermissions([
      "workspace.settings.update",
      "unknown.perm",
      "workspace.settings.update",
      "workspace.settings.view",
      "project.archive",
    ]);
    expect(parsed).toEqual([
      "workspace.settings.update",
      "workspace.settings.view",
    ]);
    expect(parseWorkspacePermissions([])).toEqual([]);
    expect(parseWorkspacePermissions(["foo", "bar", "project.view"])).toEqual(
      [],
    );
  });

  it("AC-08 / Ticket 02: enforcedWorkspacePermissions returns only enforced permissions in order", () => {
    expect(
      enforcedWorkspacePermissions([
        "workspace.settings.view",
        "workspace.settings.update",
        "workspace.delete",
      ]),
    ).toEqual(["workspace.settings.view", "workspace.settings.update"]);
    expect(
      enforcedWorkspacePermissions([
        "workspace.unrecognized.custom",
        "workspace.members.view",
      ]),
    ).toEqual(["workspace.members.view"]);
    expect(
      enforcedWorkspacePermissions([
        "workspace.settings.view",
        "workspace.members.view",
        "workspace.members.email.view",
        "workspace.members.role.update",
        "workspace.settings.update",
        "workspace.projects.create",
        "workspace.projects.delete",
        "workspace.states.manage",
      ]),
    ).toEqual([
      "workspace.settings.view",
      "workspace.settings.update",
      "workspace.members.view",
      "workspace.members.email.view",
      "workspace.members.role.update",
      "workspace.projects.create",
      "workspace.projects.delete",
      "workspace.states.manage",
    ]);
    expect(enforcedWorkspacePermissions(["workspace.delete"])).toEqual([]);
    expect(enforcedWorkspacePermissions([])).toEqual([]);
  });
});
