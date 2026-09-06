// Плоский eslint-конфиг для всего монорепо (api + web + shared).
// Правило №9 (унаследовано из telegram-bot-2/CLAUDE.md): no-floating-promises
// — error, no-explicit-any — warn. Счётчик держит scripts/check-eslint-ratchet.mjs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// api/test/** — e2e-спеки и их инфраструктура: линтятся теми же правилами,
// что api/src (иначе «all files ignored» и e2e живут без гейта).
const TS_GLOBS = [
  'api/src/**/*.ts',
  'api/test/**/*.ts',
  'web/src/**/*.{ts,tsx}',
  'shared/src/**/*.ts',
];
const API_GLOBS = ['api/src/**/*.ts', 'api/test/**/*.ts'];
const WEB_GLOBS = ['web/src/**/*.{ts,tsx}'];
const SHARED_GLOBS = ['shared/src/**/*.ts'];
const SPEC_GLOBS = [
  '**/*.spec.ts',
  '**/*.e2e-spec.ts',
  '**/*.test.ts',
  '**/*.test.tsx',
  'api/test/e2e-support/**/*.ts',
];
// Мессенджеры только через адаптеры (CLAUDE.md, раздел «Каналы») — сюда
// разрешён прямой импорт telegraf, остальному api/src — только через адаптер.
const MESSENGER_ADAPTER_GLOBS = ['api/src/telegram/**/*.ts', 'api/src/channels/**/*.ts'];

const LAYERS = 'CLAUDE.md, раздел «Слои»';
const layerPath = (name, who) => ({
  name,
  message: `${who} не зависит от ${name} — ${LAYERS}.`,
});
const layerPattern = (group, message) => ({ group, message: `${message} — ${LAYERS}.` });
// new Date(строка/число) в бизнес-логике запрещён — DateTime.fromISO /
// fromMillis / fromJSDate (Luxon). CLAUDE.md, раздел «Время».
const NO_DATE_CTOR = {
  selector: 'NewExpression[callee.name="Date"][arguments.length>0]',
  message:
    'new Date(строка/число) в бизнес-логике запрещён — DateTime.fromISO / fromMillis / fromJSDate (Luxon).',
};
// enum не используем — union-тип строк или as const объект.
const NO_ENUM = {
  selector: 'TSEnumDeclaration',
  message: 'enum не используем — union-тип строк или as const объект.',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.config.{ts,js,mjs,cjs}',
      // Worktree агентов Claude Code (.claude/ в .gitignore) — иначе eslint
      // линтит вторую копию репозитория и падает на её файлах.
      '.claude/**',
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
    plugins: { 'import-x': importX },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    settings: {
      // Резолвер для import-x/no-cycle и no-self-import: понимает .ts/.tsx и
      // npm-workspace пакет @xuanxue/shared (симлинк в node_modules).
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ alwaysTryTypes: true }),
      ],
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Доп. TS-правило для всей кодовой базы (см. package.json → check).
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // CLAUDE.md, раздел «Храповики»/«Дубли и мёртвый код»: циклы импортов и
      // самоимпорты плодят расползающуюся логику так же, как маршруты-дубли.
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-duplicates': 'error',
      // Только Luxon — CLAUDE.md, раздел «Время».
      'no-restricted-imports': [
        'error',
        {
          paths: ['moment', 'dayjs', 'date-fns'].map((name) => ({
            name,
            message: 'Только Luxon — CLAUDE.md, раздел «Время».',
          })),
        },
      ],
    },
  },
  {
    // api не тянет фронтовые зависимости, мессенджер — только через адаптер
    // (api/src/telegram|channels). CLAUDE.md, раздел «Слои»/«Каналы».
    files: API_GLOBS,
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            layerPath('react', 'api'),
            layerPath('react-dom', 'api'),
            {
              name: 'telegraf',
              message: `Мессенджеры только через адаптеры (api/src/telegram или api/src/channels) — CLAUDE.md, раздел «Каналы».`,
            },
          ],
          patterns: [
            layerPattern(
              ['**/web/src/*', '**/web/src/**'],
              'api не импортирует web/src — общий код живёт в shared/',
            ),
          ],
        },
      ],
      'no-restricted-syntax': ['error', NO_DATE_CTOR],
    },
  },
  {
    // Внутри адаптеров telegraf разрешён — единственная точка прямого
    // обращения к SDK мессенджера. CLAUDE.md, раздел «Слои».
    files: MESSENGER_ADAPTER_GLOBS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [layerPath('react', 'api'), layerPath('react-dom', 'api')],
          patterns: [
            layerPattern(
              ['**/web/src/*', '**/web/src/**'],
              'api не импортирует web/src — общий код живёт в shared/',
            ),
          ],
        },
      ],
    },
  },
  {
    // api/src исключён из consistent-type-imports: Nest-декораторы держатся
    // на emitDecoratorMetadata (design:paramtypes), которому нужен рантайм-
    // импорт класса в конструкторе (@Inject по типу). Автофикс на
    // `import type` стёр бы этот импорт и сломал бы DI молча. Чистые типы
    // (интерфейсы, DTO-поля) в api по-прежнему можно и нужно импортировать
    // через `import type` вручную — просто без автоматического гейта.
    files: SHARED_GLOBS.concat(WEB_GLOBS),
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // web не тянет бэкендовые зависимости, сеть только через http.ts, enum
    // не используем. CLAUDE.md, раздел «Слои».
    files: WEB_GLOBS,
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-imports': [
        'error',
        {
          paths: [layerPath('mongoose', 'web'), layerPath('telegraf', 'web')],
          patterns: [
            layerPattern(
              ['@nestjs/*', '**/api/src/*', '**/api/src/**'],
              'web не импортирует api/src и @nestjs/* — общий код живёт в shared/',
            ),
          ],
        },
      ],
      // Сеть только через web/src/api/http.ts — единая обработка ошибок,
      // credentials и формата ответа. CLAUDE.md, раздел «Слои».
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Сеть только через web/src/api/http.ts.' },
      ],
      'no-restricted-syntax': ['error', NO_ENUM],
    },
  },
  {
    // web/src/api/** — сама реализация http-клиента, ей можно вызывать fetch.
    files: ['web/src/api/**/*.{ts,tsx}'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // shared без бэкендовых/фронтовых/мессенджерных зависимостей — обеими
    // сторонами импортируется напрямую. CLAUDE.md, раздел «Слои»/«Время».
    files: SHARED_GLOBS,
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            layerPath('mongoose', 'shared'),
            layerPath('react', 'shared'),
            layerPath('telegraf', 'shared'),
          ],
          patterns: [layerPattern(['@nestjs/*'], 'shared не зависит от @nestjs/*')],
        },
      ],
      'no-restricted-syntax': ['error', NO_DATE_CTOR, NO_ENUM],
    },
  },
  {
    // React только во фронтенде: recommended + jsx-runtime (React 19, без
    // импорта React в каждом файле) + hooks (правила — error, а не warn по
    // умолчанию) + a11y recommended.
    files: WEB_GLOBS,
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...jsxA11y.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Nest/DTO валидацией пропы не проверяются рантаймом — типами достаточно.
      'react/prop-types': 'off',
    },
  },
  {
    // Спеки — не бизнес-логика: new Date('2024-...') в фикстуре, console в
    // отладке теста и enum-моки допустимы без гейтов.
    files: SPEC_GLOBS,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
  eslintConfigPrettier,
);
