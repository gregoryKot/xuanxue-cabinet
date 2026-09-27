// Форматтер числа видео-ответов учеников для раздела «Экзамены» (CLAUDE.md
// «Продуктовая фича = число в своём разделе», ADR-0137) — чистая функция,
// юнит-тест без DOM, включая пустую базу. По образцу
// exam-items/examVideosSummaryText.ts (там — видео вопросов, другой смысл:
// то, что загрузил учитель; здесь — то, что прислали ученики).
import type { AnswerVideoStatsDto } from '@xuanxue/shared';
import { formatFileSize } from '../lib/formatFileSize';

/** `null` — пустая база или сбой загрузки: честное отсутствие, не
 * «0 видео-ответов» (CLAUDE.md). */
export function formatAnswerVideosSummary(
  stats: AnswerVideoStatsDto | null,
): string | null {
  if (!stats || stats.count === 0) return null;
  return `Видео-ответов от учеников: ${stats.count} — ${formatFileSize(stats.totalBytes)}`;
}
