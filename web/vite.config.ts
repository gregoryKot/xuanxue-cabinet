/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Тот же тёмно-зелёный/чернильный тон, что заливка круга в
// web/public/icons/icon.svg (scripts/generate-pwa-icons.mjs) — единый цвет
// иконки, theme-color браузера и статус-бара Android.
const THEME_COLOR = '#1f3b2f';
// Фон сплэш-экрана при запуске установленного приложения — светлый нейтральный
// тон интерфейса (--surface-2 в web/src/index.css), а не белый по умолчанию.
const BACKGROUND_COLOR = '#f2f0ed';

export default defineConfig({
  // В разработке web живёт на :5173, а api — на :3000 (README, RUNBOOK §1).
  // http.ts ходит по относительному `/api/...` — без прокси запросы упирались
  // бы в сам dev-сервер Vite. В проде прокси не нужен: Nest раздаёт web/dist
  // и /api с одного порта.
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  plugins: [
    react(),
    // PWA (ADR-0006, CLAUDE.md «Приложение на телефоне»): манифест и service
    // worker собирает vite-plugin-pwa при обычном `vite build`, гейт после
    // сборки — scripts/check-pwa.mjs.
    VitePWA({
      // Обновление по кнопке в тосте (web/src/pwa/UpdateToast.tsx), а не
      // молча в фоне — пользователь не должен терять несохранённые правки.
      registerType: 'prompt',
      // Регистрируем service worker сами, из кода (web/src/pwa/useServiceWorkerUpdate.ts),
      // чтобы управлять моментом показа тоста об обновлении.
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Сюань-Сюэ',
        short_name: 'Сюань-Сюэ',
        description:
          'Расписание, ссылки на занятия и записи школы тайцзицюань «Сюань-Сюэ»',
        lang: 'ru',
        dir: 'ltr',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        categories: ['education', 'health'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // CLAUDE.md: /api никогда не кешируется (устаревшее расписание,
            // чужие данные на общем телефоне).
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
        cleanupOutdatedCaches: true,
        // Новый SW ждёт закрытия всех вкладок / нажатия «Обновить» в тосте —
        // не подхватывает управление и не чистит старый кеш втихую.
        clientsClaim: false,
        skipWaiting: false,
      },
      // Дев-сервер PWA не поднимаем: в разработке SW не нужен, а vitest
      // (использует тот же vite.config.ts) не должен пытаться собирать
      // PWA-ассеты при прогоне тестов.
      devOptions: { enabled: false },
    }),
  ],
  // @xuanxue/shared — npm-workspace пакет, в node_modules он симлинк на
  // ../shared (CommonJS-сборка, ADR-0016: так его читает api). Vite резолвит
  // симлинк по реальному пути вне node_modules и по умолчанию не считает его
  // «зависимостью для commonjs-интеропа» — именованные экспорты dist/index.js
  // пропадали в `vite build` (первый рантайм-импорт значения, не типа, из
  // web/src — до PR J1 такого не было). `include` явно возвращает путь под
  // commonjs-обработку, не трогая резолв путей для всего остального.
  build: {
    commonjsOptions: { include: [/node_modules/, /shared[\\/]dist/] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      // istanbul, не v8 (ADR-0018): v8 считает ветки по счётчикам исполнения
      // блоков, число веток плавает между машинами на одном и том же коде
      // (PR #57, 98.28 локально против 98.27 в CI). istanbul инструментирует
      // по AST — число веток фиксировано кодом, порог детерминирован.
      provider: 'istanbul',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/setupTests.ts',
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
      ],
      // Порога здесь больше нет: раньше thresholds.autoUpdate сам переписывал
      // этот файл при росте покрытия (без финального \n) и ронял
      // `prettier --check` на чистом дереве (docs/audits/2026-09-12-quality-audit.md,
      // находка H2). Храповик — внешний scripts/check-web-coverage-ratchet.mjs
      // с бейслайном в scripts/web-coverage-baseline.json; он сам запускает
      // vitest с этим же --coverage. Файл vitest больше не трогает.
    },
  },
});
