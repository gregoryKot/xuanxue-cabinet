import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      // istanbul, не v8 (ADR-0018): набор веток фиксирован AST, а не
      // поведением рантайма — порог детерминирован локально и в CI.
      provider: 'istanbul',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        // Барабан-реэкспорт без логики (CLAUDE.md, «Дубли и мёртвый код»).
        'src/index.ts',
      ],
      // Порог — scripts/check-vitest-coverage-ratchet.mjs (аудит 2026-09-12,
      // M5): раньше у shared порога покрытия не было вовсе.
    },
  },
});
