// Подпись под тегом в общем списке школы (экран тега, ADR-0075/0078) — два
// числа сразу: сколько дат занятий и сколько материалов. Чистая функция,
// юнит-тест без DOM (CLAUDE.md «Тесты»); склонение — pluralRu
// (shared/src/plural-ru.ts), тот же приём, что у gradingQueueHint.ts.
//
// Ноль — не «0 занятий» (CLAUDE.md «Продуктовая фича = число...», честная
// пустота словами, не мусорная цифра), а «занятий нет»/«материалов нет»:
// сводка `GET /api/tags` включает тег, если он встретился хотя бы в одной
// из двух коллекций (tags.queries.ts, mergeTagSummaries), так что именно
// вторая цифра у такого тега может оказаться нулём.
import { pluralRu, type TagSummaryDto } from '@xuanxue/shared';

const LESSON_FORMS = {
  one: 'занятие',
  few: 'занятия',
  many: 'занятий',
  other: 'занятия',
};
const MATERIAL_FORMS = {
  one: 'материал',
  few: 'материала',
  many: 'материалов',
  other: 'материала',
};

function countPhrase(
  count: number,
  forms: typeof LESSON_FORMS,
  noneText: string,
): string {
  return count === 0 ? noneText : `${count} ${pluralRu(count, forms)}`;
}

export function formatTagSummaryMeta(summary: TagSummaryDto): string {
  const lessons = countPhrase(summary.lessonCount, LESSON_FORMS, 'занятий нет');
  const materials = countPhrase(summary.materialCount, MATERIAL_FORMS, 'материалов нет');
  return `${lessons} · ${materials}`;
}
