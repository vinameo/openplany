import { describe, expect, it } from "vitest";
import { workspacePath, workspaceSettingsPath } from "./workspacePaths";

describe("workspacePaths", () => {
  it("builds the workspace Home path", () => {
    expect(workspacePath("the-firsts")).toBe("/the-firsts");
  });

  it("builds the settings path, with or without a section", () => {
    expect(workspaceSettingsPath("the-firsts")).toBe("/the-firsts/settings");
    expect(workspaceSettingsPath("the-firsts", "members")).toBe(
      "/the-firsts/settings/members",
    );
  });

  it("encodes every segment the same way", () => {
    expect(workspacePath("a b")).toBe("/a%20b");
    expect(workspaceSettingsPath("a b", "x/y")).toBe("/a%20b/settings/x%2Fy");
  });
});
