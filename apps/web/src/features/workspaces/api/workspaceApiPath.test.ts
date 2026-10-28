import { describe, expect, it } from "vitest";
import { workspaceApiPath } from "./workspaceApiPath";

describe("workspaceApiPath", () => {
  it("builds canonical base path for workspace-scoped API endpoints", () => {
    expect(workspaceApiPath("my-workspace")).toBe(
      "/api/workspaces/my-workspace",
    );
  });

  it("encodes workspace slug to protect against delimiter collisions", () => {
    expect(workspaceApiPath("team/slug")).toBe("/api/workspaces/team%2Fslug");
  });
});
