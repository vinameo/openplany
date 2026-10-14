import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export const URL_SELECTORS = [
  {
    selector: "TemplateLiteral[quasis.0.value.raw='/']",
    message:
      "Build app URLs with the path helpers (workspacePath, workspaceSettingsPath, projectPath) instead of a template string.",
  },
];

export const I18N_RESTRICTED_SELECTORS = [
  {
    selector: "JSXText[value=/[a-zA-Z]/]",
    message: "Use t() from react-i18next instead of hardcoded text in JSX.",
  },
  {
    selector:
      "JSXExpressionContainer > TemplateLiteral[quasis.0.value.raw=/[a-zA-Z]/]",
    message:
      "Use t() from react-i18next instead of template literal with text in JSX.",
  },
  {
    selector:
      "JSXAttribute[name.name=/^(aria-label|label|placeholder|title|description|alt|error|message)$/] > Literal[value=/[a-zA-Z]/]:not([value='OpenPlany'])",
    message:
      "Use t() from react-i18next instead of hardcoded text in JSX prop.",
  },
  {
    selector:
      "JSXAttribute[name.name=/^(aria-label|label|placeholder|title|description|alt|error|message)$/] > JSXExpressionContainer > Literal[value=/[a-zA-Z]/]:not([value='OpenPlany'])",
    message:
      "Use t() from react-i18next instead of hardcoded text in JSX prop.",
  },
  {
    selector:
      "Property[key.name=/^(message|title|label|description|placeholder)$/][value.type='Literal'][value.value=/[a-zA-Z]/]:not([value.value='OpenPlany'])",
    message:
      "Use t() from react-i18next instead of hardcoded text in object property.",
  },
  {
    selector:
      "CallExpression[callee.name='useDocumentTitle'] > Literal.arguments:first-child[value=/[a-zA-Z]/]:not([value='OpenPlany'])",
    message: "Use t() from react-i18next instead of hardcoded document title.",
  },
  {
    selector:
      "CallExpression[callee.name=/^set.*(Error|Message|Alert)$/] > Literal.arguments:first-child[value=/[a-zA-Z]/]",
    message:
      "Use t() from react-i18next instead of hardcoded string in error/message/alert setter.",
  },
  {
    selector:
      "CallExpression[callee.property.name='setFieldError'] > Literal.arguments:nth-child(2)[value=/[a-zA-Z]/]",
    message:
      "Use t() from react-i18next instead of hardcoded second argument to setFieldError.",
  },
  {
    selector:
      "CallExpression[callee.name='setFieldError'] > Literal.arguments:nth-child(2)[value=/[a-zA-Z]/]",
    message:
      "Use t() from react-i18next instead of hardcoded second argument to setFieldError.",
  },
  {
    selector:
      "VariableDeclarator > Literal[value=/^[^(].*(\\s.*[a-zA-Z]|[a-zA-Z].*\\s)/]:not([value=/OpenPlany/])",
    message:
      "Use t() from react-i18next instead of hardcoded constant with spaces.",
  },
  {
    selector:
      "LogicalExpression[operator=/^(\\|\\||\\?\\?)$/] > Literal.right[value=/^[^(].*(\\s.*[a-zA-Z]|[a-zA-Z].*\\s)/]:not([value=/OpenPlany/])",
    message:
      "Use t() from react-i18next instead of hardcoded fallback with spaces.",
  },
];

export const ALL_RESTRICTED_SELECTORS = [
  ...URL_SELECTORS,
  ...I18N_RESTRICTED_SELECTORS,
];

/**
 * Exempt areas from hardcoded text checks (WEB B8).
 * As each area is translated, it is removed from this list until empty.
 * Note: URL template rules ALWAYS apply to exempt areas as well.
 */
export const EXEMPT_AREAS = [
  // Quản trị, hồ sơ, phần chung (Ticket 09) - testing
];

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Applies to non-exempt files: enforces URL helpers and no hardcoded text
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*Paths.ts",
      "src/**/*.test.{ts,tsx}",
      "src/test/**",
      "src/**/test/**",
      ...EXEMPT_AREAS,
    ],
    rules: {
      "no-restricted-syntax": ["error", ...ALL_RESTRICTED_SELECTORS],
    },
  },
  ...(EXEMPT_AREAS.length > 0
    ? [
        {
          // Exempt areas: only enforces URL helpers (never loses URL rule, BA ADR-07)
          files: EXEMPT_AREAS,
          ignores: [
            "src/**/*Paths.ts",
            "src/**/*.test.{ts,tsx}",
            "src/test/**",
          ],
          rules: {
            "no-restricted-syntax": ["error", ...URL_SELECTORS],
          },
        },
      ]
    : []),
]);
