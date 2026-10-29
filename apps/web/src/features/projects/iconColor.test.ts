import { describe, expect, it } from "vitest";
import { adjustIconColorForContrast, contrastRatio } from "./iconColor";

describe("iconColor", () => {
  it("computes standard contrast ratio of 21 for pure black and pure white", () => {
    const ratio = contrastRatio("#000000", "#FFFFFF");
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("computes contrast ratio of 1 for identical colors", () => {
    const ratio = contrastRatio("#FFFFFF", "#FFFFFF");
    expect(ratio).toBeCloseTo(1, 2);
  });

  it("keeps colors that already meet or exceed 3:1 contrast ratio", () => {
    // #4F46E5 on white has contrast ~5.4:1
    const color = "#4F46E5";
    const adjusted = adjustIconColorForContrast(color, "#FFFFFF");
    expect(adjusted).toBe(color);
  });

  it("darkens light yellow on white until contrast ratio >= 3:1", () => {
    const lightYellow = "#FEF08A";
    const initialRatio = contrastRatio(lightYellow, "#FFFFFF");
    expect(initialRatio).toBeLessThan(3);

    const adjusted = adjustIconColorForContrast(lightYellow, "#FFFFFF");
    expect(contrastRatio(adjusted, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    // Darkened color is not equal to original
    expect(adjusted).not.toBe(lightYellow);
  });

  it("lightens dark color on dark background until contrast ratio >= 3:1", () => {
    const darkBg = "#0F172A";
    const darkNavy = "#1E293B";
    const initialRatio = contrastRatio(darkNavy, darkBg);
    expect(initialRatio).toBeLessThan(3);

    const adjusted = adjustIconColorForContrast(darkNavy, darkBg);
    expect(contrastRatio(adjusted, darkBg)).toBeGreaterThanOrEqual(3);
    expect(adjusted).not.toBe(darkNavy);
  });

  it("falls back to DEFAULT_PROJECT_ICON_COLOR when hex format is invalid", () => {
    const adjusted = adjustIconColorForContrast("invalid-color", "#FFFFFF");
    expect(contrastRatio(adjusted, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });
});
