// Тихая строка состояния автосохранения (ТЗ п.2) — чистый форматтер с
// тестом, без DOM (CLAUDE.md «Тесты»). «idle» — ответов ещё не было и
// сохранять нечего, строка не показывается вовсе (AttemptScreen.tsx решает
// это по `null`).
import type { AutosaveStatus } from './useAttemptAutosave';

export function formatSaveStatus(status: AutosaveStatus): string | null {
  switch (status) {
    case 'idle':
      return null;
    case 'saving':
      return 'Сохраняем…';
    case 'saved':
      return 'Сохранено';
    case 'error':
      return 'Не сохранилось — попробуем ещё раз';
  }
}
