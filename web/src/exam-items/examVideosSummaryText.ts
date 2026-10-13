// Форматтер числа видео вопросов/вариантов для раздела «Экзамены»
// (CLAUDE.md «Продуктовая фича = число в своём разделе», ADR-0133) — чистая
// функция, юнит-тест без DOM (CLAUDE.md «Тесты»). Объём — общий
// lib/formatFileSize.ts (materials/ADR-0057), а не своя копия формулы
// килобайт/мегабайт: examImagesSummaryText.ts завела такую копию раньше, а
// заводить третью незачем.
import type { ExamVideoStatsDto } from '@xuanxue/shared';
import { formatFileSize } from '../lib/formatFileSize';

/**
 * `null` — пустая база или сбой загрузки, нечего показывать (CLAUDE.md
 * «Продуктовая фича = число в своём разделе»: честное отсутствие, не
 * «0 видео»). Число без кадра-превью (ADR-0182) дописывается, только когда оно
 * больше нуля: у кого кадр есть везде, лишний «без кадра: 0» — шум. Форма «Видео к вопросам: N» не склоняется по числу — pluralRu
 * не нужен, тот же приём, что у formatExamImagesSummary.
 */
export function formatExamVideosSummary(stats: ExamVideoStatsDto | null): string | null {
  if (!stats || stats.count === 0) return null;
  const base = `Видео к вопросам: ${stats.count} — ${formatFileSize(stats.totalBytes)}`;
  return stats.withoutPosterCount > 0
    ? `${base}, без кадра: ${stats.withoutPosterCount}`
    : base;
}
