/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TEST_TIMEOUT_MS } from './src/test-support/testTimeouts';

export default defineConfig({
  // В разработке web живёт на :5173, а api — на :3000 (README, RUNBOOK §1).
  // http.ts ходит по относительному `/api/...` — без прокси запросы упирались
  // бы в сам dev-сервер Vite. В проде прокси не нужен: Nest раздаёт web/dist
  // и /api с одного порта.
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  plugins: [react()],
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
    // Бюджет теста должен быть шире одного ожидания элемента: тест делает
    // два-три findBy* подряд, и при равных числах vitest успевал убить тест
    // первым (см. src/test-support/testTimeouts.ts).
    testTimeout: TEST_TIMEOUT_MS,
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
        // Регистрация шрифтов — только side-effect импорты CSS, без логики
        // (docs/adr/0031-visual-direction-quiet-and-noble.md); тест на
        // `import` без ветвлений ничего не проверяет, а исполняется файл
        // только из main.tsx, который тесты не рендерят и который сам
        // исключён строкой выше.
        'src/fonts.ts',
        'src/setupTests.ts',
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
        // Инфраструктура тестов (фейки, обёртки рендера) — не продуктовый код,
        // не должна засчитываться в покрытие (аудит 2026-09-12, M2).
        'src/test-support/**',
      ],
      // Порог живёт не здесь: scripts/check-vitest-coverage-ratchet.mjs
      // (аудит 2026-09-12, H2) — thresholds.autoUpdate переписывал этот файл
      // при росте покрытия и срезал финальный \n, что ломало prettier --check.
    },
  },
});
