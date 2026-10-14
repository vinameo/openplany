import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  languageFromAcceptLanguage,
  storedLanguage,
} from "./languages.js";
import { en } from "./catalog/en.js";
import { vi } from "./catalog/vi.js";
import { LANGUAGE_RESOURCES } from "./catalog/index.js";
import type { MessageKey, MessageRef } from "./catalog/types.js";

describe("storedLanguage (RQ B4.1, INV-01, AC-08)", () => {
  it("defaults to 'en'", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
  });

  it("normalizes empty or missing values to DEFAULT_LANGUAGE ('en')", () => {
    expect(storedLanguage(undefined)).toBe("en");
    expect(storedLanguage(null)).toBe("en");
    expect(storedLanguage("")).toBe("en");
    expect(storedLanguage(123)).toBe("en");
    expect(storedLanguage({})).toBe("en");
  });

  it("accepts exact supported languages without alteration", () => {
    expect(storedLanguage("en")).toBe("en");
    expect(storedLanguage("vi")).toBe("vi");
  });

  it("rejects non-exact matches per B4.1 and falls back to 'en'", () => {
    expect(storedLanguage("VI")).toBe("en");
    expect(storedLanguage(" vi ")).toBe("en");
    expect(storedLanguage("vi-VN")).toBe("en");
    expect(storedLanguage('"vi"')).toBe("en");
    expect(storedLanguage("fr")).toBe("en");
    expect(storedLanguage("a".repeat(300))).toBe("en");
  });
});

describe("languageFromAcceptLanguage (API B3, B6, INV-01, INV-05, AC-07)", () => {
  it("handles missing, non-string, or empty headers", () => {
    expect(languageFromAcceptLanguage(undefined)).toBe("en");
    expect(languageFromAcceptLanguage(null)).toBe("en");
    expect(languageFromAcceptLanguage("")).toBe("en");
    expect(languageFromAcceptLanguage(42)).toBe("en");
  });

  it("handles simple tags with case-insensitivity, whitespace, and subtags", () => {
    expect(languageFromAcceptLanguage("vi")).toBe("vi");
    expect(languageFromAcceptLanguage("VI")).toBe("vi");
    expect(languageFromAcceptLanguage(" vi ")).toBe("vi");
    expect(languageFromAcceptLanguage("vi-VN")).toBe("vi");
    expect(languageFromAcceptLanguage("en-US")).toBe("en");
  });

  it("respects RFC 9110 qvalues and preference order", () => {
    expect(languageFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(languageFromAcceptLanguage("fr-FR, vi;q=0.5")).toBe("vi");
    expect(languageFromAcceptLanguage("en;q=0.4, vi;q=0.8")).toBe("vi");
  });

  it("discards entries with q=0 or invalid q syntax", () => {
    expect(languageFromAcceptLanguage("vi;q=0")).toBe("en");
    expect(languageFromAcceptLanguage("vi;q=0.0")).toBe("en");
    expect(languageFromAcceptLanguage("vi;q=0.000")).toBe("en");
    expect(languageFromAcceptLanguage("vi;q=abc")).toBe("en");
    expect(languageFromAcceptLanguage("vi;q=2")).toBe("en");
    expect(languageFromAcceptLanguage("vi;q=0x1")).toBe("en");
    expect(languageFromAcceptLanguage("vi;q=")).toBe("en");
  });

  it("ignores non-q parameters and assumes default q=1", () => {
    expect(languageFromAcceptLanguage("vi;level=1")).toBe("vi");
    expect(languageFromAcceptLanguage("vi;level=1;q=0.7")).toBe("vi");
  });

  it("rejects wildcards, unsupported languages, and malformed empty parts", () => {
    expect(languageFromAcceptLanguage("*")).toBe("en");
    expect(languageFromAcceptLanguage("fr")).toBe("en");
    expect(languageFromAcceptLanguage(";;;")).toBe("en");
  });

  it("rejects headers exceeding 256 characters", () => {
    const longHeader = "vi," + "en;q=0.9,".repeat(30);
    expect(longHeader.length).toBeGreaterThan(256);
    expect(languageFromAcceptLanguage(longHeader)).toBe("en");
  });

  it("rejects headers with NUL or invalid control characters", () => {
    expect(languageFromAcceptLanguage("vi\0")).toBe("en");
    expect(languageFromAcceptLanguage("vi\x01")).toBe("en");
    expect(languageFromAcceptLanguage("vi\r\n")).toBe("en");
    expect(languageFromAcceptLanguage("vi;q=1\0")).toBe("en");
  });

  it("breaks ties with the earlier entry in the header", () => {
    expect(languageFromAcceptLanguage("vi;q=0.5, en;q=0.5")).toBe("vi");
    expect(languageFromAcceptLanguage("en;q=0.5, vi;q=0.5")).toBe("en");
  });
});

describe("MessageRef and compile-time MessageKey typing", () => {
  it("allows constructing MessageRef with valid keys", () => {
    const ref1: MessageRef = { key: "common:roles.workspace.admin" };
    expect(ref1.key).toBe("common:roles.workspace.admin");

    const ref2: MessageRef = {
      key: "common:test.minute",
      params: { count: 5 },
    };
    expect(ref2.key).toBe("common:test.minute");

    const ref3: MessageRef = {
      key: "permissions:project.archive",
    };
    expect(ref3.key).toBe("permissions:project.archive");
  });

  it("disallows invalid keys at compile time", () => {
    // @ts-expect-error - invalid namespace
    const _invalidNs: MessageKey = "nonexistent:someKey";

    // @ts-expect-error - invalid key in valid namespace
    const _invalidKey: MessageKey = "common:nonExistentKey";

    // @ts-expect-error - invalid MessageRef key
    const _invalidRef: MessageRef = { key: "invalid:key" };

    expect(true).toBe(true);
  });
});

describe("Catalog parity and interpolation variables (INV-04, BA M-1)", () => {
  function extractInterpolationVariables(str: string): string[] {
    const matches = str.match(/\{\{([^}]+)\}\}/g) ?? [];
    return matches.map((m) => m.slice(2, -2).trim()).sort();
  }

  it("ensures LANGUAGE_RESOURCES contains all supported languages", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_RESOURCES[lang]).toBeDefined();
    }
  });

  it("ensures vi has matching namespaces and keys for all non-_one keys in en", () => {
    const enNamespaces = Object.keys(en) as (keyof typeof en)[];
    const viNamespaces = Object.keys(vi) as (keyof typeof vi)[];

    expect(viNamespaces.sort()).toEqual(enNamespaces.sort());

    for (const ns of enNamespaces) {
      const enEntries = en[ns] as Record<string, string>;
      const viEntries = vi[ns] as Record<string, string>;

      for (const [key, enText] of Object.entries(enEntries)) {
        if (key.endsWith("_one")) {
          // Plural in en must have matching _other
          const otherKey = key.replace(/_one$/, "_other");
          expect(
            enEntries[otherKey],
            `Expected ${ns}:${otherKey} to exist alongside ${ns}:${key}`,
          ).toBeDefined();
          continue;
        }

        expect(
          viEntries[key],
          `Expected key ${ns}:${key} to exist in vi catalog`,
        ).toBeDefined();

        const enVars = extractInterpolationVariables(enText);
        const viVars = extractInterpolationVariables(viEntries[key]!);
        expect(
          viVars,
          `Interpolation variables for ${ns}:${key} must match between en and vi`,
        ).toEqual(enVars);
      }

      for (const key of Object.keys(viEntries)) {
        expect(
          key.endsWith("_one"),
          `Vietnamese catalog must not contain _one plural key ${ns}:${key}`,
        ).toBe(false);

        expect(
          enEntries[key],
          `Extra key in vi catalog ${ns}:${key} not found in en`,
        ).toBeDefined();
      }
    }
  });
});

describe("Terminology checks (INV-12, AC-13, RQ B10)", () => {
  const FORBIDDEN_VI_TERMS = [
    "Không gian làm việc",
    "Quản trị dự án",
    "Mã dự án",
    "Khách",
    "Người xem",
    "Người đóng góp",
    "Người bình luận",
  ];

  it("ensures all role label keys in vi match en exactly (INV-12)", () => {
    const roleKeys = [
      "roles.workspace.admin",
      "roles.workspace.member",
      "roles.workspace.guest",
      "roles.project.admin",
      "roles.project.contributor",
      "roles.project.commenter",
      "roles.project.viewer",
    ] as const;

    for (const key of roleKeys) {
      expect(vi.common[key]).toBe(en.common[key]);
    }
  });

  it("ensures no string in vi catalog contains forbidden terminology", () => {
    for (const [ns, entries] of Object.entries(vi)) {
      for (const [key, text] of Object.entries(
        entries as Record<string, string>,
      )) {
        for (const forbidden of FORBIDDEN_VI_TERMS) {
          expect(
            text.includes(forbidden),
            `Forbidden term "${forbidden}" found in vi catalog at ${ns}:${key} ("${text}")`,
          ).toBe(false);
        }
      }
    }
  });
});
