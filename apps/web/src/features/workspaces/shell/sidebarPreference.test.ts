import { describe, expect, it } from "vitest";
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  parseSidebarCollapsed,
  serializeSidebarCollapsed,
} from "./sidebarPreference";

describe("sidebarPreference", () => {
  it("defines the expected storage key", () => {
    expect(SIDEBAR_COLLAPSED_STORAGE_KEY).toBe(
      "openplany.workspaceSidebar.collapsed",
    );
  });

  describe("parseSidebarCollapsed", () => {
    it("returns true only for exact string 'true'", () => {
      expect(parseSidebarCollapsed("true")).toBe(true);
    });

    it("returns false for all other values (falsy, wrong case, corrupt JSON)", () => {
      expect(parseSidebarCollapsed("false")).toBe(false);
      expect(parseSidebarCollapsed(null)).toBe(false);
      expect(parseSidebarCollapsed(undefined)).toBe(false);
      expect(parseSidebarCollapsed("")).toBe(false);
      expect(parseSidebarCollapsed("abc")).toBe(false);
      expect(parseSidebarCollapsed("True")).toBe(false);
      expect(parseSidebarCollapsed("1")).toBe(false);
      expect(parseSidebarCollapsed('"true"')).toBe(false);
    });
  });

  describe("serializeSidebarCollapsed", () => {
    it("serializes boolean to exact string 'true' or 'false'", () => {
      expect(serializeSidebarCollapsed(true)).toBe("true");
      expect(serializeSidebarCollapsed(false)).toBe("false");
    });

    it("round-trips correctly", () => {
      expect(parseSidebarCollapsed(serializeSidebarCollapsed(true))).toBe(true);
      expect(parseSidebarCollapsed(serializeSidebarCollapsed(false))).toBe(false);
    });
  });
});
