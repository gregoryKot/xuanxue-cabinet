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
// Оболочка кабинета: боковая колонка, строка сверху и их стили. Отличается
// от остального web одним запретом — см. WEB_RESTRICTED_IMPORTS ниже.
const SHELL_GLOBS = ['web/src/app/**/*.{ts,tsx}'];

// Только Luxon — CLAUDE.md, раздел «Время». Список общий: блок web ниже
// перечисляет его заново, потому что eslint перезаписывает правило целиком,
// а не дополняет. До этого он там не повторялся — и запрет на фронтенде
// молча не действовал вовсе, хотя CLAUDE.md обещает обратное.
const DATE_LIBRARY_PATHS = ['moment', 'dayjs', 'date-fns'].map((name) => ({
  name,
  message: 'Только Luxon — CLAUDE.md, раздел «Время».',
}));

const LAYERS = 'CLAUDE.md, раздел «Слои»';
const layerPath = (name, who) => ({
  name,
  message: `${who} не зависит от ${name} — ${LAYERS}.`,
});
const layerPattern = (group, message) => ({ group, message: `${message} — ${LAYERS}.` });

// Запреты импорта для всего web. Вынесены в константу, потому что блок
// оболочки ниже добавляет к ним свой: eslint не сливает правило из разных
// блоков, последний подходящий перезаписывает его целиком — без этой
// константы запреты слоёв в web/src/app/** молча перестали бы действовать.
const WEB_RESTRICTED_IMPORTS = {
  paths: [
    ...DATE_LIBRARY_PATHS,
    layerPath('mongoose', 'web'),
    layerPath('telegraf', 'web'),
  ],
  patterns: [
    layerPattern(
      ['@nestjs/*', '**/api/src/*', '**/api/src/**'],
      'web не импортирует api/src и @nestjs/* — общий код живёт в shared/',
    ),
  ],
};

// Линия снизу помечает текстовую ссылку в потоке содержимого; оболочка
// кабинета её не носит (docs/adr/0098). Правило держит гейт, а не память:
// «Профиль» в боковой колонке уже один раз приехал с textLinkStyle.
const SHELL_RESTRICTED_IMPORTS = {
  ...WEB_RESTRICTED_IMPORTS,
  patterns: [
    ...WEB_RESTRICTED_IMPORTS.patterns,
    {
      group: ['**/screenLayout', '**/components/screenLayout'],
      importNames: ['textLinkStyle', 'textLinkLineStyle'],
      message:
        'Оболочка не носит линию снизу — это признак текстовой ссылки в содержимом (docs/adr/0098). Ссылка оболочки берёт personLinkStyle/sideLinkStyle из app/sideNavStyles.ts.',
    },
  ],
};

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
// history.pushState/replaceState напрямую запрещены — React Router и наш
// useHistorySheet (см. web/src/hooks/useHistorySheet.ts) держат историю сами;
// прямой вызов расходится с их состоянием (двойное закрытие листа/навигация).
// CLAUDE.md, раздел «Фронтенд».
const NO_HISTORY_MUTATION = ['pushState', 'replaceState'].flatMap((property) =>
  ['history', 'window.history'].map((object) => ({
    object,
    property,
    message: 'через useHistorySheet/useNavigate — CLAUDE.md «Фронтенд».',
  })),
);

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
    // Килсвитч service worker (ADR-0032) — единственный файл репозитория,
    // который выполняется в контексте service worker, не браузера: `self`,
    // `caches` и `clients` из этого окружения, не из globals.browser.
    files: ['web/public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
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
      'no-restricted-imports': ['error', { paths: DATE_LIBRARY_PATHS }],
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
      'no-restricted-syntax': ['error', NO_DATE_CTOR, NO_ENUM],
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
      'no-restricted-imports': ['error', WEB_RESTRICTED_IMPORTS],
      // Сеть только через web/src/api/http.ts — единая обработка ошибок,
      // credentials и формата ответа. CLAUDE.md, раздел «Слои».
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Сеть только через web/src/api/http.ts.' },
      ],
      'no-restricted-syntax': ['error', NO_ENUM, NO_DATE_CTOR],
      'no-restricted-properties': ['error', ...NO_HISTORY_MUTATION],
    },
  },
  {
    // Оболочка кабинета вдобавок к запретам web не тянет стили текстовой
    // ссылки (docs/adr/0098). Правило перечисляет и запреты слоёв: eslint
    // перезаписывает правило целиком, а не дополняет.
    files: SHELL_GLOBS,
    rules: { 'no-restricted-imports': ['error', SHELL_RESTRICTED_IMPORTS] },
  },
  {
    // web/src/api/** — сама реализация http-клиента, ей можно вызывать fetch.
    files: ['web/src/api/**/*.{ts,tsx}'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // Единственный легитимный прямой вызов replaceState: чистим
    // #tgAuthResult= из адреса после входа через Telegram (см. комментарий в
    // самом файле) — до useHistorySheet (нет листа, который открывается) и до
    // react-router navigate (адрес меняется без записи в историю и без
    // перехода). CLAUDE.md, раздел «Фронтенд».
    files: ['web/src/auth/useTelegramAuthResultLogin.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Форматтеры готового ISO UTC в пояс браузера (CLAUDE.md «Размер»: Luxon
    // не тянется в стартовый бандл ради вывода даты на экране) — не бизнес-
    // арифметика, реальные расчёты времени (окна запросов, дедлайны) считает
    // сервер на Luxon. `new Date(iso)` здесь только строит объект под
    // `Intl.DateTimeFormat`/`getFullYear` и т. п., дальше не сдвигается.
    files: ['web/src/lib/formatDate.ts'],
    rules: { 'no-restricted-syntax': ['error', NO_ENUM] },
  },
  {
    // Два предметных исключения для окон запросов (CLAUDE.md «Размер»:
    // тянуть Luxon в web ради пары строк дороже, чем исключение с тестом
    // на переход времени). planningWindow.ts: `new Date(now)` клонирует
    // момент, чтобы найти местную полночь ближайшего воскресенья
    // (setHours/setDate) — перевод «местная стена» → UTC-момент делает сам
    // движок с базой часовых поясов устройства (planningWindow.tz.test.ts).
    // dateWindow.ts: `shiftByWeeks` считает недели ровно в UTC через
    // `getTime()` — единственный честный способ не съехать на ±1 час на
    // переходе DST (dateWindow.tz.test.ts); обход через Intl.formatToParts
    // оставил бы ту же арифметику, только спрятанную от линтера.
    // nextLessonsWindow.ts: `new Date(now)` — тот же клон момента, чтобы
    // отбросить секунды (setUTCSeconds), ключ предзагрузки первого экрана
    // должен совпасть с ключом хука (api/apiPaths.ts).
    files: [
      'web/src/planning/planningWindow.ts',
      'web/src/lib/dateWindow.ts',
      'web/src/templates/nextLessonsWindow.ts',
    ],
    rules: { 'no-restricted-syntax': ['error', NO_ENUM] },
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
