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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/setupTests.ts',
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
      ],
      // autoUpdate — встроенный храповик: порог поднимается сам при росте
      // покрытия, снижение роняет CI (CLAUDE.md, раздел «Храповики»).
      thresholds: {
        lines: 90,
        branches: 88,
        functions: 84,
        statements: 90,
        autoUpdate: true,
      },
    },
  },
});
