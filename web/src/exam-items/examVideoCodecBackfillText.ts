// Тексты карточки «Перегнать видео» (ADR-0189) — чистые функции, юнит-тест без DOM
// (CLAUDE.md «Тесты»). Акцент `**…**` рисует RichText (ADR-0124): число и место
// запуска, а не слова вокруг.
import type { CodecBackfillProgress } from './examVideoCodecBackfillRunner';

export interface CodecBackfillView extends CodecBackfillProgress {
  phase: 'idle' | 'running' | 'done';
  error: string | null;
}

/** До первого нажатия: откуда число, что сделает кнопка и откуда её запускать
 * (CLAUDE.md «Каждая фича объясняет…»). `null` — перегонять нечего. */
export function formatCodecBackfillIntro(
  codecPendingCount: number | null,
): string | null {
  if (codecPendingCount === null || codecPendingCount <= 0) return null;
  return (
    'Часть видео снята на iPhone в формате HEVC, и у части учеников оно не открывается. ' +
    `Кабинет проверит **${codecPendingCount} видео** и перегонит нужные в обычный MP4. ` +
    'Запускайте с **Mac или iPhone** и не закрывайте вкладку. Оригиналы остаются на месте.'
  );
}

const FAILED_HINT =
  'оригиналы целы. Этот браузер не умеет читать HEVC. Запустите с Mac или iPhone.';

function formatRunning({
  converted,
  alreadyH264,
  failed,
  total,
}: CodecBackfillProgress): string {
  const done = converted + alreadyH264;
  const progress = total === null ? `**${done}**` : `**${done} из ${total}**`;
  return failed > 0
    ? `Перегнано ${progress}, не вышло **${failed}**`
    : `Перегнано ${progress}`;
}

function formatFinished({
  converted,
  alreadyH264,
  failed,
}: CodecBackfillProgress): string {
  if (converted + alreadyH264 + failed === 0) {
    return 'Перегонять нечего: все видео уже в обычном MP4.';
  }
  const parts = [
    converted > 0 ? `перегнано **${converted}**` : null,
    alreadyH264 > 0 ? `**${alreadyH264}** уже в обычном MP4` : null,
    failed > 0 ? `не вышло **${failed}**` : null,
  ].filter((part) => part !== null);
  const sentence = parts.join(', ');
  if (failed === 0) return `Готово: ${sentence}`;
  const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return `${capitalized} — ${FAILED_HINT}`;
}

/** Строка под кнопкой во время прогона и после него; `null` — до нажатия. */
export function formatCodecBackfillStatus(view: CodecBackfillView): string | null {
  if (view.phase === 'idle') return null;
  if (view.error) return view.error;
  return view.phase === 'running' ? formatRunning(view) : formatFinished(view);
}
