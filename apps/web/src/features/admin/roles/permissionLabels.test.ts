import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSION_ITEMS } from "./test/rolesFixtures";
import { permissionGroupOf } from "./permissionLabels";

describe("permissionLabels", () => {
  const allPermissions = DEFAULT_PERMISSION_ITEMS.map((p) => p.key);

  it("every permission has an assigned group", () => {
    for (const perm of allPermissions) {
      const group = permissionGroupOf(perm);
      expect(group).toBeTruthy();
      expect(group).not.toBe("General");
    }
  });

  it("maps workspace permissions to correct groups", () => {
    expect(permissionGroupOf("workspace.settings.view")).toBe("Settings");
    expect(permissionGroupOf("workspace.settings.update")).toBe("Settings");
    expect(permissionGroupOf("workspace.delete")).toBe("Workspace");
    expect(permissionGroupOf("workspace.members.add")).toBe("Members");
    expect(permissionGroupOf("workspace.projects.create")).toBe("Projects");
  });

  it("maps project permissions to correct groups", () => {
    expect(permissionGroupOf("project.settings.view")).toBe("Project");
    expect(permissionGroupOf("project.archive")).toBe("Project");
    expect(permissionGroupOf("project.members.manage")).toBe("Members");
    expect(permissionGroupOf("project.workitems.view")).toBe("Work items");
    expect(permissionGroupOf("project.comments.create")).toBe("Comments");
    expect(permissionGroupOf("project.reactions.create")).toBe("Comments");
    expect(permissionGroupOf("project.cycles.create")).toBe("Cycles");
    expect(permissionGroupOf("project.modules.create")).toBe("Modules");
    expect(permissionGroupOf("project.views.create")).toBe("Views");
    expect(permissionGroupOf("project.pages.create")).toBe("Pages");
    expect(permissionGroupOf("project.labels.manage")).toBe(
      "Labels, states and estimates",
    );
    expect(permissionGroupOf("project.states.manage")).toBe(
      "Labels, states and estimates",
    );
    expect(permissionGroupOf("project.estimates.manage")).toBe(
      "Labels, states and estimates",
    );
    expect(permissionGroupOf("project.analytics.view")).toBe("Analytics");
  });
});
