import {
  DEFAULT_PROJECT_ICON_COLOR,
  PROJECT_ICON_COLOR_PATTERN,
} from "@repo/contracts";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  if (!PROJECT_ICON_COLOR_PATTERN.test(hex)) return null;
  const num = parseInt(hex.slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function toHex(rgb: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(rgb.r).toString(16).padStart(2, "0");
  const g = clamp(rgb.g).toString(16).padStart(2, "0");
  const b = clamp(rgb.b).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;

  const toLinear = (val: number): number => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio: (L1 + 0.05) / (L2 + 0.05). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * RQ D18: Trộn dần về đen (nền sáng) hoặc trắng (nền tối),
 * mỗi bước 5%, tối đa 20 bước, tới khi contrast ratio >= 3:1.
 */
export function adjustIconColorForContrast(
  hex: string,
  background: string,
): string {
  const validHex = PROJECT_ICON_COLOR_PATTERN.test(hex)
    ? hex.toUpperCase()
    : DEFAULT_PROJECT_ICON_COLOR;
  const validBg = PROJECT_ICON_COLOR_PATTERN.test(background)
    ? background.toUpperCase()
    : "#FFFFFF";

  if (contrastRatio(validHex, validBg) >= 3) {
    return validHex;
  }

  const origRgb = parseHex(validHex)!;
  const bgLum = relativeLuminance(validBg);
  const targetVal = bgLum > 0.5 ? 0 : 255; // đen trên nền sáng, trắng trên nền tối

  let candidate = validHex;
  for (let step = 1; step <= 20; step++) {
    const t = step * 0.05;
    const blended: Rgb = {
      r: origRgb.r * (1 - t) + targetVal * t,
      g: origRgb.g * (1 - t) + targetVal * t,
      b: origRgb.b * (1 - t) + targetVal * t,
    };
    candidate = toHex(blended);
    if (contrastRatio(candidate, validBg) >= 3) {
      return candidate;
    }
  }

  return candidate;
}
