import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
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
    // App URLs come from the path helpers (workspacePath, projectPath, ...),
    // so the URL shape and its encoding live in one place (CLAUDE.md §8).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*Paths.ts', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "TemplateLiteral[quasis.0.value.raw='/']",
          message:
            'Build app URLs with the path helpers (workspacePath, workspaceSettingsPath, projectPath) instead of a template string.',
        },
      ],
    },
  },
])
