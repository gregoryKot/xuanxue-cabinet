// Плоский eslint-конфиг для всего монорепо (api + web + shared).
// Правило №9 (унаследовано из telegram-bot-2/CLAUDE.md): no-floating-promises
// — error, no-explicit-any — warn. Счётчик держит scripts/check-eslint-ratchet.mjs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

const TS_GLOBS = ['api/src/**/*.ts', 'web/src/**/*.{ts,tsx}', 'shared/src/**/*.ts'];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.config.{ts,js,mjs,cjs}',
    ],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: TS_GLOBS,
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['api/src/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  eslintConfigPrettier,
);
