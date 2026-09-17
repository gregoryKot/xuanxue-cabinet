// Форматтер числа картинок вариантов ответа для раздела «Экзамены»
// (CLAUDE.md «Продуктовая фича = число в своём разделе», ADR-0035
// «Последствия»: база растёт с каждой картинкой, ~200 КБ) — чистая функция,
// юнит-тест без DOM (CLAUDE.md «Тесты»).
import type { ExamImageStatsDto } from '@xuanxue/shared';

const BYTES_IN_KB = 1024;
const BYTES_IN_MB = BYTES_IN_KB * 1024;

/** До 1 МБ — килобайты целым числом (дробная доля читателю не нужна),
 * дальше — мегабайты с одним знаком после запятой; запятая — русский
 * десятичный разделитель, не точка. */
function formatVolume(totalBytes: number): string {
  if (totalBytes < BYTES_IN_MB) return `${Math.round(totalBytes / BYTES_IN_KB)} КБ`;
  return `${(totalBytes / BYTES_IN_MB).toFixed(1).replace('.', ',')} МБ`;
}

/**
 * `null` — пустая база или сбой загрузки, нечего показывать (CLAUDE.md
 * «Продуктовая фича = число в своём разделе»: честное отсутствие, не
 * «0 картинок»). Форма «Картинок к вопросам: N» не склоняется по числу —
 * pluralRu не нужен.
 */
export function formatExamImagesSummary(stats: ExamImageStatsDto | null): string | null {
  if (!stats || stats.count === 0) return null;
  return `Картинок к вопросам: ${stats.count} — ${formatVolume(stats.totalBytes)}`;
}
