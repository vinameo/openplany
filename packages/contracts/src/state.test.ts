import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATE_KEYS,
  INITIAL_STATE_KEY,
  PROJECT_STATES_MAX,
  STATE_COLORS,
  STATE_ERROR_CODES,
  STATE_GROUPS,
  STATE_LEVELS,
  STATE_NAME_MAX,
  WORKSPACE_STATES_MAX,
  normalizeStateName,
  stateNameProblem,
} from "./state.js";

describe("state contracts", () => {
  it("defines 5 state groups in canonical order", () => {
    expect(STATE_GROUPS).toEqual([
      "backlog",
      "planned",
      "active",
      "finished",
      "cancelled",
    ]);
  });

  it("defines 3 levels", () => {
    expect(STATE_LEVELS).toEqual(["default", "workspace", "project"]);
  });

  it("defines 5 default state keys and initial state key", () => {
    expect(DEFAULT_STATE_KEYS).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "done",
      "cancelled",
    ]);
    expect(INITIAL_STATE_KEY).toBe("backlog");
  });

  it("defines 12 fixed state colors with uppercase hex format", () => {
    expect(STATE_COLORS).toHaveLength(12);
    for (const color of STATE_COLORS) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("defines state limits", () => {
    expect(STATE_NAME_MAX).toBe(40);
    expect(WORKSPACE_STATES_MAX).toBe(50);
    expect(PROJECT_STATES_MAX).toBe(50);
  });

  it("defines all state error codes", () => {
    expect(STATE_ERROR_CODES).toEqual({
      NOT_FOUND: "STATE_NOT_FOUND",
      NAME_TAKEN: "STATE_NAME_TAKEN",
      NAME_TAKEN_IN_PROJECTS: "STATE_NAME_TAKEN_IN_PROJECTS",
      WORKSPACE_LIMIT_REACHED: "WORKSPACE_STATE_LIMIT_REACHED",
      PROJECT_LIMIT_REACHED: "PROJECT_STATE_LIMIT_REACHED",
      REPLACEMENT_REQUIRED: "STATE_REPLACEMENT_REQUIRED",
      REPLACEMENT_INVALID: "STATE_REPLACEMENT_INVALID",
      UNAVAILABLE: "STATE_UNAVAILABLE",
      GROUP_CHANGE_UNCONFIRMED: "STATE_GROUP_CHANGE_UNCONFIRMED",
    });
  });

  describe("normalizeStateName", () => {
    it("normalizes to NFC and trims leading/trailing whitespace", () => {
      const nfd = "D\u0323a\u0301"; // "Đã" in NFD
      expect(normalizeStateName(`   ${nfd}   `)).toBe(nfd.normalize("NFC"));
    });
  });

  describe("stateNameProblem", () => {
    it("returns nameRequired for empty or whitespace-only names", () => {
      expect(stateNameProblem("")).toEqual({
        key: "state:errors.nameRequired",
      });
      expect(stateNameProblem("   ")).toEqual({
        key: "state:errors.nameRequired",
      });
    });

    it("returns nameTooLong for names exceeding 40 characters", () => {
      expect(stateNameProblem("a".repeat(41))).toEqual({
        key: "state:errors.nameTooLong",
        params: { max: 40 },
      });
      // 40 chars trimmed is fine
      expect(stateNameProblem(`  ${"a".repeat(40)}  `)).toBeNull();
    });

    it("returns nameHiddenChars for names with hidden/control characters", () => {
      expect(stateNameProblem("QA\nreview")).toEqual({
        key: "state:errors.nameHiddenChars",
      });
      expect(stateNameProblem("QA\u200B")).toEqual({
        key: "state:errors.nameHiddenChars",
      });
    });

    it("returns null for valid state names", () => {
      expect(stateNameProblem("Backlog")).toBeNull();
      expect(stateNameProblem("In Progress")).toBeNull();
      expect(stateNameProblem("Đang làm việc")).toBeNull();
    });
  });
});
