import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import {
  ALL_RESTRICTED_SELECTORS,
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
