import { describe, expect, it } from "vitest";
import { projectApiPath } from "./projectApiPath";

describe("projectApiPath", () => {
  it("builds canonical base path for project-scoped API endpoints", () => {
    expect(projectApiPath("the-firsts", "TFP11")).toBe(
      "/api/workspaces/the-firsts/projects/TFP11",
    );
  });

  it("encodes workspace slug and project identifier to protect against delimiter collisions", () => {
    expect(projectApiPath("team/slug", "P#1")).toBe(
      "/api/workspaces/team%2Fslug/projects/P%231",
    );
  });
});

