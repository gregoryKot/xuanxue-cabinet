// Тексты карточки «Снять кадры» (ADR-0182) — чистые функции, юнит-тест без DOM
// (CLAUDE.md «Тесты»). Акцент `**…**` рисует RichText (ADR-0124): число, а не
// слова вокруг него.
import type { PosterBackfillProgress } from './examVideoPosterBackfillRunner';

export interface PosterBackfillView extends PosterBackfillProgress {
  phase: 'idle' | 'running' | 'done';
  error: string | null;
}

/** До первого нажатия: откуда число и зачем кнопка (CLAUDE.md «Каждая фича
 * объясняет…»). `null` — снимать нечего, карточке показываться незачем. */
export function formatPosterBackfillIntro(
  withoutPosterCount: number | null,
): string | null {
  if (withoutPosterCount === null || withoutPosterCount <= 0) return null;
  return (
    `У **${withoutPosterCount} видео** нет кадра-превью: они загружены до того, как ` +
    'кабинет стал снимать кадр при загрузке. Ученик видит чёрную плитку, пока не нажмёт.'
  );
}

const FAILED_REASON = 'этот браузер не открывает их формат. Попробуйте с Mac или iPhone.';

function formatRunning({ done, failed, total }: PosterBackfillProgress): string {
  const progress = total === null ? `**${done}**` : `**${done} из ${total}**`;
  return failed > 0 ? `Снято ${progress}, не вышло **${failed}**` : `Снято ${progress}`;
}

function formatFinished({ done, failed }: PosterBackfillProgress): string {
  if (done === 0 && failed === 0) return 'Снимать нечего: у всех видео кадр уже есть.';
  if (failed === 0) return `Готово: снято **${done}**`;
  if (done === 0) return `Не вышло снять **${failed}** — ${FAILED_REASON}`;
  return `Снято **${done}**, не вышло **${failed}** — ${FAILED_REASON}`;
}

/** Строка под кнопкой во время прогона и после него; `null` — до нажатия. */
export function formatPosterBackfillStatus(view: PosterBackfillView): string | null {
  if (view.phase === 'idle') return null;
  if (view.error) return view.error;
  return view.phase === 'running' ? formatRunning(view) : formatFinished(view);
}
