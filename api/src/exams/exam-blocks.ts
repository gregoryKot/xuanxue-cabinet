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
    // Тот же приём, что imageId варианта (exam-attempt-snapshot.ts,
    // toAttemptOption): нет значения — ключа в JSON нет вовсе, а не
    // `questionsPerAttempt: undefined`.
    ...(block.questionsPerAttempt !== undefined
      ? { questionsPerAttempt: block.questionsPerAttempt }
      : {}),
    ...mapRequiredItemIds(block),
  }));
}

/** ADR-0082, дополнение: учитель мог отметить вопрос обязательным, потом
 * убрать его из списка — отметка не должна пережить вопрос молча (иначе
 * следующая проверка длины считала бы её как будто он всё ещё в блоке).
 * Оставляем только id, которые реально есть в `itemIds`, в его порядке, без
 * повторов; если после фильтра ничего не осталось — ключа в записи нет
 * вовсе, тем же приёмом, что `questionsPerAttempt` выше. */
function mapRequiredItemIds(
  block: ExamBlockInput,
): Pick<ExamBlockRecord, 'requiredItemIds'> | Record<string, never> {
  const requiredIds = block.requiredItemIds;
  if (requiredIds === undefined) return {};
  // Идём по itemIds, а не по requiredIds: так порядок берётся из списка
  // блока, а повтор в самом requiredIds (или в itemIds) схлопывается сам.
  const requiredIdSet = new Set(requiredIds);
  const kept = block.itemIds.filter((itemId) => requiredIdSet.has(itemId));
  return kept.length > 0 ? { requiredItemIds: kept } : {};
}

/** Всё, что видно по самим блокам, одной проверкой перед сохранением
 * (ExamsService.assertBlocksSavable): повтор вопроса и «вопросов ученику»
 * больше списка. Первая нарушенная — первая ошибка. */
export function assertBlocksConsistent(blocks: readonly ExamBlockRecord[]): void {
  assertNoRepeatedItems(blocks);
  assertQuestionsPerAttemptFits(blocks);
  assertRequiredFitsPick(blocks);
}

/** Вопрос не может стоять в форме дважды — ни в одном блоке, ни в разных
 * (ТЗ 4.3, п.4: сдающий увидит его два раза и решит, что это ошибка).
 * Проверка по всем блокам сразу, не по одному. */
function assertNoRepeatedItems(blocks: readonly ExamBlockRecord[]): void {
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

/** ADR-0082: `questionsPerAttempt` — сколько вопросов из `itemIds` увидит
 * сдающий, не может быть больше самого списка (иначе выбирать нечего).
 * Снимок попытки (exam-attempt-snapshot.ts) на всякий случай берёт не
 * больше, чем есть, но отказ на сохранении — понятнее «тихого» урезания. */
function assertQuestionsPerAttemptFits(blocks: readonly ExamBlockRecord[]): void {
  for (const block of blocks) {
    const limit = block.questionsPerAttempt;
    if (limit === undefined || limit <= block.itemIds.length) continue;
    const total = block.itemIds.length;
    throw new InvalidInputError(
      `В списке ${total} ${pluralRu(total, QUESTION_FORMS)}, а ученику вы хотите ` +
        `показать ${limit}. Уменьшите число или добавьте вопросы.`,
    );
  }
}

/** ADR-0082, дополнение: обязательные входят в выборку всегда, значит их не
 * может быть больше самой выборки — иначе часть обязательных отвалится
 * молча. Проверка идёт только при заданном `questionsPerAttempt`: без него
 * выборки нет вовсе, `requiredItemIds` ни на что не влияет (mapBlocks и без
 * этой проверки уже отбросил id вне `itemIds`, длина сравнивается с тем, что
 * реально сохранится). */
function assertRequiredFitsPick(blocks: readonly ExamBlockRecord[]): void {
  for (const block of blocks) {
    const limit = block.questionsPerAttempt;
    const requiredCount = block.requiredItemIds?.length ?? 0;
    if (limit === undefined || requiredCount <= limit) continue;
    throw new InvalidInputError(
      `Обязательных вопросов ${requiredCount}, а ученику вы показываете ${limit}. ` +
        'Уменьшите число обязательных или увеличьте «Вопросов ученику».',
    );
  }
}
