import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIORITIES,
  DEFAULT_PRIORITY_KEYS,
  INITIAL_PRIORITY_KEY,
  PRIORITY_BANDS,
  PRIORITY_ERROR_CODES,
} from "./priority.js";
import { STATE_COLORS } from "./state.js";

describe("priority contracts", () => {
  it("defines 5 fixed priority bands in order", () => {
    expect(PRIORITY_BANDS).toEqual(["urgent", "high", "medium", "low", "none"]);
  });

  it("defines default keys matching priority bands", () => {
    expect(DEFAULT_PRIORITY_KEYS).toEqual(PRIORITY_BANDS);
  });

  it("sets INITIAL_PRIORITY_KEY to none", () => {
    expect(INITIAL_PRIORITY_KEY).toBe("none");
    expect(DEFAULT_PRIORITY_KEYS).toContain(INITIAL_PRIORITY_KEY);
  });

  it("contains 5 default priorities with valid bands and colors from STATE_COLORS", () => {
    expect(DEFAULT_PRIORITIES).toHaveLength(5);
    const validColors = new Set<string>(STATE_COLORS);

    for (const item of DEFAULT_PRIORITIES) {
      expect(DEFAULT_PRIORITY_KEYS).toContain(item.key);
      expect(item.band).toBe(item.key);
      expect(validColors.has(item.color)).toBe(true);
    }
  });

  it("defines PRIORITY_ERROR_CODES", () => {
    expect(PRIORITY_ERROR_CODES.UNAVAILABLE).toBe("PRIORITY_UNAVAILABLE");
  });
});
