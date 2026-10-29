import { DEFAULT_PROJECT_COVER, PROJECT_COVER_KEYS } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { pickRandomCover, PROJECT_COVERS, projectCover } from "./projectCovers";

describe("projectCovers", () => {
  it("has full and thumb images for all 8 project cover keys", () => {
    for (const key of PROJECT_COVER_KEYS) {
      const entry = PROJECT_COVERS[key];
      expect(entry).toBeDefined();
      expect(typeof entry.full).toBe("string");
      expect(entry.full.length).toBeGreaterThan(0);
      expect(typeof entry.thumb).toBe("string");
      expect(entry.thumb.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe("string");
    }
  });

  it("returns default cover for unknown or invalid key", () => {
    const unknown = projectCover("invalid-cover-key");
    const defaultEntry = projectCover(DEFAULT_PROJECT_COVER);
    expect(unknown).toEqual(defaultEntry);
  });

  it("picks random cover correctly using deterministic random generator", () => {
    expect(pickRandomCover(() => 0)).toBe(PROJECT_COVER_KEYS[0]);
    expect(pickRandomCover(() => 0.5)).toBe(PROJECT_COVER_KEYS[4]);
    expect(pickRandomCover(() => 0.999)).toBe(PROJECT_COVER_KEYS[7]);
  });
});
