import { describe, expect, it } from "vitest";
import { SETTINGS_MESSAGES, tooManyChangesMessage } from "./settingsMessages";

describe("settingsMessages", () => {
  it("provides standard settings permission messages", () => {
    expect(SETTINGS_MESSAGES.readOnly).toBe(
      "You don't have permission to change these settings.",
    );
    expect(SETTINGS_MESSAGES.permissionLost).toBe(
      "You no longer have permission to change these settings.",
    );
  });

  describe("tooManyChangesMessage", () => {
    it("handles 90 seconds (2 minutes)", () => {
      expect(tooManyChangesMessage(90)).toBe(
        "Too many changes. Try again in 2 minutes.",
      );
    });

    it("handles 30 seconds (1 minute singular)", () => {
      expect(tooManyChangesMessage(30)).toBe(
        "Too many changes. Try again in 1 minute.",
      );
    });

    it("handles null (default 60 seconds -> 1 minute singular)", () => {
      expect(tooManyChangesMessage(null)).toBe(
        "Too many changes. Try again in 1 minute.",
      );
    });

    it("handles 600 seconds (10 minutes)", () => {
      expect(tooManyChangesMessage(600)).toBe(
        "Too many changes. Try again in 10 minutes.",
      );
    });

    it("handles 0 or negative seconds (minimum 1 minute)", () => {
      expect(tooManyChangesMessage(0)).toBe(
        "Too many changes. Try again in 1 minute.",
      );
    });
  });
});
