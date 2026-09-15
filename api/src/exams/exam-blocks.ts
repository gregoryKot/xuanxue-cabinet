// Чистые функции блоков формы экзамена — без похода в базу, юнит-тест без
// Mongo (CLAUDE.md «Тесты»). Проверка «вопрос существует и опубликован в
// банке» (ТЗ 4.3, п.2–3) требует запроса к exam_items — она в ExamsService,
// здесь только то, что видно по самим блокам.
import { pluralRu, type ExamBlockInput } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { ExamBlockRecord } from './exam.schema';
import { keepOrGenerateId } from './sub-id';

/** Склонение «вопроса» — одно на файл блоков и на сервис формы: оба считают
 * вопросы в тексте ошибки (CLAUDE.md «Без магических чисел и строк»:
 * повторяющийся текст пользователю — константа в одном месте). */
export const QUESTION_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
} as const;

/** `required` здесь больше не пишется (ADR-0033) — у старых документов поле
 * останется до первого сохранения формы, в контракт оно всё равно не уходит.
 *
 * Блок с `id` — существующий, сохраняется как есть; без `id` — новый блок,
 * сервис создаёт его сам (keepOrGenerateId, sub-id.ts — тот же приём, что у
 * варианта вопроса, exam-item-options.ts/mapOptions). `undefined` на входе
 * (блоки в PATCH не прислали) — не трогаем массив вовсе. */
export function mapBlocks(
  blocks: ExamBlockInput[] | undefined,
): ExamBlockRecord[] | undefined {
  if (blocks === undefined) return undefined;
  return blocks.map((block) => ({
    id: keepOrGenerateId(block.id),
    title: block.title ?? '',
    itemIds: block.itemIds,
    shuffle: block.shuffle ?? false,
  }));
}

/** Вопрос не может стоять в форме дважды — ни в одном блоке, ни в разных
 * (ТЗ 4.3, п.4: сдающий увидит его два раза и решит, что это ошибка).
 * Проверка по всем блокам сразу, не по одному. */
export function assertNoRepeatedItems(blocks: readonly ExamBlockRecord[]): void {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const block of blocks) {
    for (const itemId of block.itemIds) {
      if (seen.has(itemId)) repeated.add(itemId);
      seen.add(itemId);
    }
  }
  if (repeated.size === 0) return;
  throw new InvalidInputError(
    `В форме повторяется ${repeated.size} ${pluralRu(repeated.size, QUESTION_FORMS)}: ` +
      'один и тот же вопрос стоит в нескольких местах. Уберите повтор — ' +
      'сдающий увидит вопрос дважды и решит, что это ошибка.',
  );
}

/** Правило ТЗ 4.3, п.1: опубликовать можно только форму, где есть хотя бы
 * один блок хотя бы с одним вопросом. */
export function hasAnyQuestion(blocks: readonly ExamBlockRecord[]): boolean {
  return blocks.some((block) => block.itemIds.length > 0);
}
