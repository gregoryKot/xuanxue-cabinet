// Тихая строка состояния автосохранения (ТЗ п.2) — чистый форматтер с
// тестом, без DOM (CLAUDE.md «Тесты»). «idle» — ответов ещё не было и
// сохранять нечего, строка не показывается вовсе (AttemptScreen.tsx решает
// это по `null`). «refused» (аудит 2026-10-01, F44) — сервер отказал
// навсегда, повтора не будет: показываем его текст, а не обещание повтора.
import { REFUSED_FALLBACK_MESSAGE } from './attemptSaveFailure';
import type { AutosaveStatus } from './useAttemptAutosave';

export function formatSaveStatus(
  status: AutosaveStatus,
  refusal: string | null = null,
): string | null {
  switch (status) {
    case 'idle':
      return null;
    case 'saving':
      return 'Сохраняем…';
    case 'saved':
      return 'Сохранено';
    case 'error':
      return 'Не сохранилось — попробуем ещё раз';
    case 'refused':
      return refusal ?? REFUSED_FALLBACK_MESSAGE;
  }
}
