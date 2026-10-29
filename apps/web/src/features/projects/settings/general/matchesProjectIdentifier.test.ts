import { describe, expect, it } from "vitest";
import { matchesProjectIdentifier } from "./matchesProjectIdentifier";

describe("matchesProjectIdentifier", () => {
  it("returns true when inputs match exactly", () => {
    expect(matchesProjectIdentifier("TFP11", "TFP11")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesProjectIdentifier("tfp11", "TFP11")).toBe(true);
    expect(matchesProjectIdentifier("TFP11", "tfp11")).toBe(true);
    expect(matchesProjectIdentifier("Tfp11", "tFP11")).toBe(true);
  });

  it("trims leading and trailing whitespace from input", () => {
    expect(matchesProjectIdentifier("  TFP11  ", "TFP11")).toBe(true);
    expect(matchesProjectIdentifier("tfp11 ", "TFP11")).toBe(true);
    expect(matchesProjectIdentifier("\tTFP11\n", "TFP11")).toBe(true);
  });

  it("returns false for partial or mismatched identifiers", () => {
    expect(matchesProjectIdentifier("TFP1", "TFP11")).toBe(false);
    expect(matchesProjectIdentifier("TFP111", "TFP11")).toBe(false);
    expect(matchesProjectIdentifier("OTHER", "TFP11")).toBe(false);
    expect(matchesProjectIdentifier("", "TFP11")).toBe(false);
    expect(matchesProjectIdentifier("   ", "TFP11")).toBe(false);
  });
});
