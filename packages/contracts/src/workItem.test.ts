import { describe, expect, it } from "vitest";
import {
  normalizeWorkItemDescription,
  normalizeWorkItemTitle,
  workItemDescriptionProblem,
  workItemKey,
  workItemTitleProblem,
  WORK_ITEM_DESCRIPTION_MAX_LENGTH,
  WORK_ITEM_TITLE_MAX_LENGTH,
} from "./workItem.js";

describe("workItem contracts", () => {
  describe("workItemKey", () => {
    it("formats identifier and number", () => {
      expect(workItemKey("OPS", 1)).toBe("OPS-1");
      expect(workItemKey("PROJ", 42)).toBe("PROJ-42");
    });
  });

  describe("normalizeWorkItemTitle", () => {
    it("applies NFC and trims leading and trailing whitespace", () => {
      expect(normalizeWorkItemTitle("  Fix login  ")).toBe("Fix login");
      // combining accents normalized to composed NFC
      expect(normalizeWorkItemTitle("  e\u0301  ")).toBe("é");
    });
  });

  describe("normalizeWorkItemDescription", () => {
    it("converts CRLF and CR to LF", () => {
      expect(normalizeWorkItemDescription("## Steps\r\n- a\r- b")).toBe(
        "## Steps\n- a\n- b",
      );
    });

    it("returns empty string if all whitespace", () => {
      expect(normalizeWorkItemDescription("   \n\t ")).toBe("");
    });

    it("preserves leading indentation when non-empty", () => {
      expect(normalizeWorkItemDescription("    code block")).toBe(
        "    code block",
      );
    });
  });

  describe("workItemTitleProblem", () => {
    it("returns titleRequired for empty or whitespace-only title", () => {
      expect(workItemTitleProblem("")).toEqual({
        key: "workItem:errors.titleRequired",
      });
      expect(workItemTitleProblem("   ")).toEqual({
        key: "workItem:errors.titleRequired",
      });
      expect(workItemTitleProblem("　")).toEqual({
        key: "workItem:errors.titleRequired",
      });
    });

    it("returns titleTooLong when exceeding max length", () => {
      const longTitle = "a".repeat(WORK_ITEM_TITLE_MAX_LENGTH + 1);
      expect(workItemTitleProblem(longTitle)).toEqual({
        key: "workItem:errors.titleTooLong",
        params: { max: WORK_ITEM_TITLE_MAX_LENGTH },
      });
    });

    it("returns titleHiddenChars for newlines and control characters", () => {
      expect(workItemTitleProblem("Fix\nlogin")).toEqual({
        key: "workItem:errors.titleHiddenChars",
      });
      expect(workItemTitleProblem("Fix\tlogin")).toEqual({
        key: "workItem:errors.titleHiddenChars",
      });
      expect(workItemTitleProblem("Fix\u0000login")).toEqual({
        key: "workItem:errors.titleHiddenChars",
      });
      expect(workItemTitleProblem("Fix\u200Blogin")).toEqual({
        key: "workItem:errors.titleHiddenChars",
      });
    });

    it("returns null for valid title", () => {
      expect(workItemTitleProblem("Fix login")).toBeNull();
      expect(
        workItemTitleProblem(
          "  " + "a".repeat(WORK_ITEM_TITLE_MAX_LENGTH) + "  ",
        ),
      ).toBeNull();
    });
  });

  describe("workItemDescriptionProblem", () => {
    it("returns null for empty description", () => {
      expect(workItemDescriptionProblem("")).toBeNull();
    });

    it("returns descriptionTooLong when exceeding max length", () => {
      const longDesc = "a".repeat(WORK_ITEM_DESCRIPTION_MAX_LENGTH + 1);
      expect(workItemDescriptionProblem(longDesc)).toEqual({
        key: "workItem:errors.descriptionTooLong",
        params: { max: WORK_ITEM_DESCRIPTION_MAX_LENGTH },
      });
    });

    it("returns descriptionHiddenChars for forbidden control characters", () => {
      expect(workItemDescriptionProblem("Notes\u0000")).toEqual({
        key: "workItem:errors.descriptionHiddenChars",
      });
      expect(workItemDescriptionProblem("Notes\u0007")).toEqual({
        key: "workItem:errors.descriptionHiddenChars",
      });
      expect(workItemDescriptionProblem("Notes\u001B")).toEqual({
        key: "workItem:errors.descriptionHiddenChars",
      });
    });

    it("allows tabs, newlines, and carriage returns in description", () => {
      expect(workItemDescriptionProblem("Line 1\r\nLine 2\tTabbed")).toBeNull();
    });
  });
});
