import { describe, expect, it } from "vitest";
import {
  canonicalProjectIdentifier,
  projectPath,
  projectSettingsPath,
} from "./projectPaths";

describe("projectPaths", () => {
  describe("projectPath", () => {
    it("builds the correct project route path", () => {
      expect(projectPath("the-firsts", "TFP11")).toBe(
        "/the-firsts/projects/TFP11",
      );
    });
  });

  describe("projectSettingsPath", () => {
    it("builds the correct project settings route path", () => {
      expect(projectSettingsPath("the-firsts", "TFP11")).toBe(
        "/the-firsts/projects/TFP11/settings",
      );
      expect(projectSettingsPath("the-firsts", "TFP11", "general")).toBe(
        "/the-firsts/projects/TFP11/settings/general",
      );
    });

    it("encodes slug and identifier properly", () => {
      expect(projectSettingsPath("team slug", "TFP 11", "general")).toBe(
        "/team%20slug/projects/TFP%2011/settings/general",
      );
    });
  });

  describe("canonicalProjectIdentifier", () => {
    it("returns canonical for valid uppercase identifier", () => {
      expect(canonicalProjectIdentifier("TFP11")).toEqual({
        kind: "canonical",
        identifier: "TFP11",
      });
      expect(canonicalProjectIdentifier("P1")).toEqual({
        kind: "canonical",
        identifier: "P1",
      });
    });

    it("returns redirect for lowercase or mixed case identifier whose uppercase matches", () => {
      expect(canonicalProjectIdentifier("tfp11")).toEqual({
        kind: "redirect",
        identifier: "TFP11",
      });
      expect(canonicalProjectIdentifier("Tfp11")).toEqual({
        kind: "redirect",
        identifier: "TFP11",
      });
    });

    it("returns invalid for strings that do not match when uppercased", () => {
      expect(canonicalProjectIdentifier("abc-12345")).toEqual({
        kind: "invalid",
      });
      expect(canonicalProjectIdentifier("1AB")).toEqual({
        kind: "invalid",
      });
      expect(canonicalProjectIdentifier("ABCDEF")).toEqual({
        kind: "invalid",
      });
      expect(canonicalProjectIdentifier("")).toEqual({
        kind: "invalid",
      });
    });
  });
});
