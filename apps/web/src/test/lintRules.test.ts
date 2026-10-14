import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import {
  ALL_RESTRICTED_SELECTORS,
  I18N_RESTRICTED_IMPORTS,
  URL_SELECTORS,
} from "../../eslint.config.js";

describe("ESLint hardcoded string rules and URL rule fixture (WEB B9)", () => {
  const linter = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: {
          "no-restricted-syntax": ["error", ...ALL_RESTRICTED_SELECTORS],
        },
      },
    ],
  });

  async function lintSnippet(code: string): Promise<string[]> {
    const results = await linter.lintText(code, {
      filePath: "src/fixture.tsx",
    });
    return results[0]?.messages.map((m) => m.message) ?? [];
  }

  describe("Allowed patterns (must pass without errors)", () => {
    it("allows t() call", async () => {
      const messages = await lintSnippet('t("auth:signIn.title");');
      expect(messages).toEqual([]);
    });

    it("allows console.error log", async () => {
      const messages = await lintSnippet('console.error("Load failed", e);');
      expect(messages).toEqual([]);
    });

    it("allows navigate call", async () => {
      const messages = await lintSnippet('navigate("/");');
      expect(messages).toEqual([]);
    });

    it("allows setFieldError when field value uses t()", async () => {
      const messages = await lintSnippet(
        'form.setFieldError("email", t("errors:invalidValue"));',
      );
      expect(messages).toEqual([]);
    });

    it("allows CSS media query starting with (", async () => {
      const messages = await lintSnippet('const Q = "(min-width: 48em)";');
      expect(messages).toEqual([]);
    });
  });

  describe("Forbidden patterns (must be caught by no-restricted-syntax)", () => {
    it("flags hardcoded setSubmitError", async () => {
      const messages = await lintSnippet('setSubmitError("Couldn\'t save");');
      expect(messages.length).toBeGreaterThan(0);
    });

    it("flags hardcoded text inside JSX", async () => {
      const messages = await lintSnippet("<Text>Save</Text>;");
      expect(messages.length).toBeGreaterThan(0);
    });

    it("flags hardcoded label prop in JSX", async () => {
      const messages = await lintSnippet('<Button label="Name" />;');
      expect(messages.length).toBeGreaterThan(0);
    });

    it("flags URL template literal", async () => {
      const messages = await lintSnippet("const url = `/${slug}`;");
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe("Module-level translation (INV-10, INV-15)", () => {
    it.each([
      'const A = translate("errors:genericError");',
      'export const A = translate("errors:genericError");',
      'const A = { title: translate("errors:genericError") };',
      'export const A = { title: translate("errors:genericError") };',
    ])("flags %s", async (code) => {
      const messages = await lintSnippet(code);
      expect(messages).toContain(
        "Don't translate at module level: keep the key and translate where the text is shown.",
      );
    });

    it.each([
      'export function a() { return translate("errors:genericError"); }',
      'const a = () => translate("errors:genericError");',
      'const A = { get title() { return translate("errors:genericError"); } };',
    ])("allows %s", async (code) => {
      expect(await lintSnippet(code)).toEqual([]);
    });
  });

  describe("Restricted i18n imports", () => {
    const importLinter = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.{ts,tsx}"],
          languageOptions: { parser: tseslint.parser },
          plugins: { "@typescript-eslint": tseslint.plugin },
          rules: {
            "@typescript-eslint/no-restricted-imports": [
              "error",
              I18N_RESTRICTED_IMPORTS,
            ],
          },
        },
      ],
    });

    async function lintImport(code: string): Promise<number> {
      const results = await importLinter.lintText(code, {
        filePath: "src/features/fixture.ts",
      });
      return results[0]?.messages.length ?? 0;
    }

    it.each([
      'import { t } from "i18next";',
      'import i18next from "i18next";',
      'import { MEMBER_MESSAGES } from "@repo/contracts";',
    ])("flags %s", async (code) => {
      expect(await lintImport(code)).toBe(1);
    });

    it.each([
      'import type { TFunction } from "i18next";',
      'import { MEMBER_MESSAGE_REFS } from "@repo/contracts";',
    ])("allows %s", async (code) => {
      expect(await lintImport(code)).toBe(0);
    });
  });

  describe("URL rule applies to exempt areas (BA ADR-07)", () => {
    const exemptLinter = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.{ts,tsx}"],
          rules: {
            "no-restricted-syntax": ["error", ...URL_SELECTORS],
          },
        },
      ],
    });

    it("flags URL template literal in exempt files", async () => {
      const results = await exemptLinter.lintText("const url = `/${slug}`;", {
        filePath: "src/features/auth/LoginPage.tsx",
      });
      const messages = results[0]?.messages.map((m) => m.message) ?? [];
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]).toContain("Build app URLs with the path helpers");
    });
  });
});
