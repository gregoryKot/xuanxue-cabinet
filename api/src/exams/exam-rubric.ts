// Чистые функции рубрики экзамена (ТЗ 4.6, п.1, ADR-0022) — без похода в
// базу, юнит-тест без Mongo (CLAUDE.md «Тесты»). Рубрика правится вместе с
// экзаменом (PATCH /exams/:id) и заменяется целиком, как blocks
// (exam-blocks.ts) — у критерия свой входной `id` тем же приёмом
// (keepOrGenerateId, sub-id.ts).
import { DEFAULT_RUBRIC, type RubricCriterionInput } from '@xuanxue/shared';
import type { RubricCriterionRecord } from './exam.schema';
import { keepOrGenerateId } from './sub-id';

/** `undefined` на входе (рубрику в PATCH не прислали) — не трогаем массив
 * вовсе, тем же правилом, что `mapBlocks` (exam-blocks.ts). */
export function mapRubric(
  rubric: RubricCriterionInput[] | undefined,
): RubricCriterionRecord[] | undefined {
  if (rubric === undefined) return undefined;
  return rubric.map((criterion) => ({
    id: keepOrGenerateId(criterion.id),
    title: criterion.title,
    description: criterion.description ?? '',
    maxScore: criterion.maxScore,
  }));
}

/** Новый экзамен приезжает с этим набором (ТЗ 4.6, п.1) — учитель
 * переписывает его под себя на экране, не дожидаясь разработчика
 * (CLAUDE.md «Кабинет учителя: всё настраивается в интерфейсе»). Критерии
 * получают свежий `id` при каждом вызове — у разных экзаменов свои копии
 * набора по умолчанию, не общие ссылки на одну и ту же строку. */
export function defaultRubric(): RubricCriterionRecord[] {
  return mapRubric([...DEFAULT_RUBRIC]) ?? [];
}
