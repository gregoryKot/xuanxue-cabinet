// Чистая логика списка вопросов экзамена — порядок, добавление, удаление и
// поиск. Для учителя экзамен теперь один список (docs/adr/0033), блок остался
// устройством хранилища. Вынесена из компонентов, чтобы проверять без React.
import type { ExamBlockInput, ExamDto, ExamItemDto } from '@xuanxue/shared';
import { matchesSearch } from '../lib/textSearch';

/** Старые многоблочные формы сливаются в один список лениво, при следующем
 * сохранении (ADR-0033): порядок здесь — блоки подряд, внутри блока свой
 * порядок вопросов. */
export function initialQuestionIds(exam: ExamDto | null): string[] {
  return exam?.blocks.flatMap((block) => block.itemIds) ?? [];
}

/** Перемешивание вопросов живёт у единственного блока (ADR-0033); у формы,
 * где блока ещё нет, перемешивать нечего. */
export function initialShuffleQuestions(exam: ExamDto | null): boolean {
  return exam?.blocks[0]?.shuffle ?? false;
}

/** Сколько вопросов из списка достаётся сдающему — тоже поле единственного
 * блока (ADR-0082). Нет поля у формы или у блока — сдающий получает все
 * вопросы, как раньше. */
export function initialQuestionsPerAttempt(exam: ExamDto | null): number | undefined {
  return exam?.blocks[0]?.questionsPerAttempt;
}

/** Отметка «обязательный» — у блока формы, не у вопроса банка (ADR-0082,
 * дополнение): один вопрос может стоять в нескольких экзаменах и быть
 * обязательным только в одном. */
export function initialRequiredIds(exam: ExamDto | null): string[] {
  return exam?.blocks.flatMap((block) => block.requiredItemIds ?? []) ?? [];
}

/** Клик по ★/☆ строки вопроса: отметка есть — снимаем, нет — ставим. */
export function toggleRequired(requiredIds: string[], itemId: string): string[] {
  return requiredIds.includes(itemId)
    ? requiredIds.filter((id) => id !== itemId)
    : [...requiredIds, itemId];
}

/** Вопрос убрали из списка — отметка «обязательный» уходит вместе с ним,
 * иначе id висел бы в состоянии без вопроса, на который указывает. */
export function pruneRequiredIds(requiredIds: string[], itemIds: string[]): string[] {
  const known = new Set(itemIds);
  return requiredIds.filter((id) => known.has(id));
}

interface ToBlockInputsParams {
  itemIds: string[];
  shuffle: boolean;
  /** `undefined` — поле не отправляется вовсе, а не «сброшено» (ADR-0082:
   * нет ключа — сдающий получает все вопросы). */
  questionsPerAttempt: number | undefined;
  requiredItemIds: string[];
  exam: ExamDto | null;
}

/** Экран всегда отправляет один блок без заголовка: `id` первого блока
 * сохраняется, остальные блоки старой формы исчезают вместе со слиянием их
 * вопросов в общий список (ADR-0033). Параметры объектом — CLAUDE.md
 * «параметров больше трёх — объект». */
export function toBlockInputs({
  itemIds,
  shuffle,
  questionsPerAttempt,
  requiredItemIds,
  exam,
}: ToBlockInputsParams): ExamBlockInput[] {
  const prunedRequiredIds = pruneRequiredIds(requiredItemIds, itemIds);
  return [
    {
      id: exam?.blocks[0]?.id,
      title: '',
      itemIds,
      shuffle,
      ...(questionsPerAttempt !== undefined && { questionsPerAttempt }),
      ...(prunedRequiredIds.length > 0 && { requiredItemIds: prunedRequiredIds }),
    },
  ];
}

/** Меняет местами соседей `index` и `index + 1`. Через срезы, а не через
 * чтение по индексу: `noUncheckedIndexedAccess` иначе требует ветку «а вдруг
 * там undefined», недостижимую при проверенных границах. */
function swapWithNext(itemIds: string[], index: number): string[] {
  return [
    ...itemIds.slice(0, index),
    ...itemIds.slice(index + 1, index + 2),
    ...itemIds.slice(index, index + 1),
    ...itemIds.slice(index + 2),
  ];
}

export function moveQuestionUp(itemIds: string[], index: number): string[] {
  if (index <= 0) return itemIds;
  return swapWithNext(itemIds, index - 1);
}

export function moveQuestionDown(itemIds: string[], index: number): string[] {
  if (index >= itemIds.length - 1) return itemIds;
  return swapWithNext(itemIds, index);
}

export function removeQuestion(itemIds: string[], itemId: string): string[] {
  return itemIds.filter((id) => id !== itemId);
}

/** Вопрос не может стоять в экзамене дважды — сдающий увидит его два раза и
 * решит, что это ошибка (сервер это тоже запрещает, `assertNoRepeatedItems`).
 * Поиск добавленный вопрос и не показывает, но вызов остаётся безопасным сам
 * по себе. */
export function addQuestion(itemIds: string[], itemId: string): string[] {
  if (itemIds.includes(itemId)) return itemIds;
  return [...itemIds, itemId];
}

/** Кандидаты поиска: только опубликованные вопросы, без уже добавленных, по
 * подстроке формулировки без регистра (тег вопроса убран из продукта,
 * ADR-0128). Фильтр локальный — список вопросов загружен целиком, отдельный
 * запрос на каждую букву не нужен. */
export function filterQuestionCandidates(
  items: ExamItemDto[],
  query: string,
  chosenIds: readonly string[],
): ExamItemDto[] {
  const chosen = new Set(chosenIds);
  return items.filter(
    (item) =>
      item.status === 'published' &&
      !chosen.has(item.id) &&
      matchesSearch([item.prompt], query),
  );
}

/** Вопрос, заведённый прямо в редакторе экзамена (ADR-0040), добавляется в
 * список для отображения сразу — без второго запроса за списком вопросов,
 * который его пока не знает. Дубли по `id` не образуются: если список уже
 * содержит вопрос (например, страницу перезагрузили), запись не повторяется. */
export function mergeCreatedItems(
  items: ExamItemDto[],
  created: ExamItemDto[],
): ExamItemDto[] {
  const known = new Set(items.map((item) => item.id));
  return [...items, ...created.filter((item) => !known.has(item.id))];
}

/** Целое число в границах поля — вынесена из examFormInput.ts (лимит размера). */
export function isValidInt(text: string, min: number, max: number): boolean {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
}
