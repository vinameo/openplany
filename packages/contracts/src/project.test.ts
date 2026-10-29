import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  isProjectCoverKey,
  isProjectIconName,
  normalizeProjectName,
  PROJECT_COVER_KEYS,
  PROJECT_DESCRIPTION_ALLOWED_CHARS,
  PROJECT_ICON_COLOR_PATTERN,
  PROJECT_ICON_NAMES,
  PROJECT_ICON_PRESET_COLORS,
  PROJECT_IDENTIFIER_PATTERN,
  PROJECT_ERROR_MESSAGES,
  PROJECT_FIELD_MESSAGES,
  PROJECT_FIELD_MESSAGE_REFS,
  projectNameProblem,
  projectDescriptionProblem,
  effectiveProjectTimezone,
  suggestProjectIdentifier,
} from "./project.js";

describe("project contracts", () => {
  describe("suggestProjectIdentifier (API B2.4)", () => {
    it("suggests identifiers according to the specification", () => {
      expect(suggestProjectIdentifier("Dự án Mobile")).toBe("DAM");
      expect(suggestProjectIdentifier("Website")).toBe("WEB");
      expect(suggestProjectIdentifier("a b c d e f")).toBe("ABCDE");
      expect(suggestProjectIdentifier("123")).toBe("");
      expect(suggestProjectIdentifier("Đường Sắt")).toBe("DS");
      expect(suggestProjectIdentifier("2024 Plan")).toBe("P");
      expect(suggestProjectIdentifier("  ")).toBe("");
      expect(suggestProjectIdentifier("🚀")).toBe("");
      expect(suggestProjectIdentifier("API v2")).toBe("AV");
      expect(suggestProjectIdentifier("Go")).toBe("GO");
    });
  });

  describe("normalizeProjectName", () => {
    it("normalizes NFD to NFC and trims whitespace", () => {
      const nfd = "  Dự án  ".normalize("NFD");
      const normalized = normalizeProjectName(nfd);
      expect(normalized).toBe("Dự án");
      expect(normalized).toBe(normalized.normalize("NFC"));
    });
  });

  describe("PROJECT_IDENTIFIER_PATTERN", () => {
    it("accepts valid identifiers", () => {
      expect(PROJECT_IDENTIFIER_PATTERN.test("A")).toBe(true);
      expect(PROJECT_IDENTIFIER_PATTERN.test("AB12C")).toBe(true);
      expect(PROJECT_IDENTIFIER_PATTERN.test("DAM")).toBe(true);
      expect(PROJECT_IDENTIFIER_PATTERN.test("WEB")).toBe(true);
    });

    it("rejects invalid identifiers", () => {
      expect(PROJECT_IDENTIFIER_PATTERN.test("dam")).toBe(false);
      expect(PROJECT_IDENTIFIER_PATTERN.test("1AB")).toBe(false);
      expect(PROJECT_IDENTIFIER_PATTERN.test("ABCDEF")).toBe(false);
      expect(PROJECT_IDENTIFIER_PATTERN.test("A-B")).toBe(false);
      expect(PROJECT_IDENTIFIER_PATTERN.test("")).toBe(false);
    });
  });

  describe("icons, colors, covers", () => {
    it("PROJECT_ICON_NAMES has 65 unique kebab-case names", () => {
      expect(PROJECT_ICON_NAMES.length).toBe(65);
      const unique = new Set(PROJECT_ICON_NAMES);
      expect(unique.size).toBe(65);
      for (const name of PROJECT_ICON_NAMES) {
        expect(name).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      }
      expect(isProjectIconName(DEFAULT_PROJECT_ICON)).toBe(true);
      expect(isProjectIconName("invalid-icon")).toBe(false);
    });

    it("PROJECT_COVER_KEYS has 8 unique keys", () => {
      expect(PROJECT_COVER_KEYS.length).toBe(8);
      const unique = new Set(PROJECT_COVER_KEYS);
      expect(unique.size).toBe(8);
      expect(isProjectCoverKey(DEFAULT_PROJECT_COVER)).toBe(true);
      expect(isProjectCoverKey("unknown-cover")).toBe(false);
    });

    it("PROJECT_ICON_PRESET_COLORS has 8 uppercase valid hex colors", () => {
      expect(PROJECT_ICON_PRESET_COLORS.length).toBe(8);
      for (const color of PROJECT_ICON_PRESET_COLORS) {
        expect(color).toMatch(PROJECT_ICON_COLOR_PATTERN);
        expect(color).toBe(color.toUpperCase());
      }
      expect(DEFAULT_PROJECT_ICON_COLOR).toBe("#868E96");
    });
  });

  describe("PROJECT_DESCRIPTION_ALLOWED_CHARS", () => {
    it("allows multi-line text, emoji sequences and an empty value", () => {
      expect(PROJECT_DESCRIPTION_ALLOWED_CHARS.test("")).toBe(true);
      expect(
        PROJECT_DESCRIPTION_ALLOWED_CHARS.test("Line 1\nLine 2\r\n\tIndented"),
      ).toBe(true);
      expect(
        PROJECT_DESCRIPTION_ALLOWED_CHARS.test(
          "Team 👨\u200d👩\u200d👧 · Dự án",
        ),
      ).toBe(true);
    });

    it("rejects NUL and other control characters", () => {
      expect(PROJECT_DESCRIPTION_ALLOWED_CHARS.test("abc\u0000")).toBe(false);
      expect(PROJECT_DESCRIPTION_ALLOWED_CHARS.test("bell\u0007")).toBe(false);
      expect(PROJECT_DESCRIPTION_ALLOWED_CHARS.test("del\u007f")).toBe(false);
    });
  });

  describe("PROJECT_ERROR_MESSAGES", () => {
    it("contains expected messages including notFound and forbidden", () => {
      expect(PROJECT_ERROR_MESSAGES.notFound).toBe(
        "This project doesn't exist.",
      );
      expect(PROJECT_ERROR_MESSAGES.forbidden).toBe(
        "You don't have access to this project.",
      );
    });
  });

  describe("PROJECT_FIELD_MESSAGES and problem helpers", () => {
    it("has all required field message constants", () => {
      expect(PROJECT_FIELD_MESSAGES.nameRequired).toBe("Enter a project name");
      expect(PROJECT_FIELD_MESSAGES.nameTooLong).toBe(
        "Enter a project name (up to 80 characters)",
      );
      expect(PROJECT_FIELD_MESSAGES.hiddenChars).toBe(
        "Contains characters that aren't allowed",
      );
      expect(PROJECT_FIELD_MESSAGES.descriptionTooLong).toBe(
        "Keep the description under 2000 characters",
      );
      expect(PROJECT_FIELD_MESSAGES.iconRequired).toBe("Choose an icon");
      expect(PROJECT_FIELD_MESSAGES.iconColorInvalid).toBe(
        "Use a color like #1A2B3C",
      );
      expect(PROJECT_FIELD_MESSAGES.coverRequired).toBe("Choose a cover");
    });

    it("projectNameProblem returns expected problem or null", () => {
      expect(projectNameProblem("")).toBe(
        PROJECT_FIELD_MESSAGE_REFS.nameRequired,
      );
      expect(projectNameProblem("   ")).toBe(
        PROJECT_FIELD_MESSAGE_REFS.nameRequired,
      );
      expect(projectNameProblem("a".repeat(80))).toBeNull();
      expect(projectNameProblem("a".repeat(81))).toBe(
        PROJECT_FIELD_MESSAGE_REFS.nameTooLong,
      );
      expect(projectNameProblem("Project \u0000")).toBe(
        PROJECT_FIELD_MESSAGE_REFS.hiddenChars,
      );
      expect(projectNameProblem("Project \u200B")).toBe(
        PROJECT_FIELD_MESSAGE_REFS.hiddenChars,
      );
      expect(projectNameProblem("Valid Project Name")).toBeNull();
    });

    it("projectDescriptionProblem returns expected problem or null", () => {
      expect(projectDescriptionProblem("")).toBeNull();
      expect(projectDescriptionProblem("a".repeat(2000))).toBeNull();
      expect(projectDescriptionProblem("a".repeat(2001))).toBe(
        PROJECT_FIELD_MESSAGE_REFS.descriptionTooLong,
      );
      expect(projectDescriptionProblem("Desc \u0000")).toBe(
        PROJECT_FIELD_MESSAGE_REFS.hiddenChars,
      );
      expect(projectDescriptionProblem("Desc \u0007")).toBe(
        PROJECT_FIELD_MESSAGE_REFS.hiddenChars,
      );
      expect(
        projectDescriptionProblem("Valid multi-line\ndescription\r\n\ttext"),
      ).toBeNull();
    });
  });

  describe("effectiveProjectTimezone (RQ D8, INV-05)", () => {
    it("returns projectTimezone when set, otherwise falls back to workspaceTimezone", () => {
      expect(effectiveProjectTimezone("Asia/Tokyo", "UTC")).toBe("Asia/Tokyo");
      expect(effectiveProjectTimezone("America/New_York", "Europe/Paris")).toBe(
        "America/New_York",
      );
      expect(effectiveProjectTimezone(null, "Europe/Paris")).toBe(
        "Europe/Paris",
      );
      expect(effectiveProjectTimezone(null, "UTC")).toBe("UTC");
    });
  });
});
