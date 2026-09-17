// Чистая логика списка вопросов экзамена — порядок, добавление, удаление и
// поиск. Для учителя экзамен теперь один список, блок остался
// устройством хранилища (docs/adr/0033-exam-as-question-list.md). Вынесена из
// компонентов, чтобы проверять без React (CLAUDE.md «Тесты»).
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

/** Экран всегда отправляет один блок без заголовка: `id` первого блока
 * сохраняется, остальные блоки старой формы исчезают вместе со слиянием их
 * вопросов в общий список (ADR-0033). */
export function toBlockInputs(
  itemIds: string[],
  shuffle: boolean,
  exam: ExamDto | null,
): ExamBlockInput[] {
  return [{ id: exam?.blocks[0]?.id, title: '', itemIds, shuffle }];
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
 * подстроке формулировки или тега без регистра. Фильтр локальный — список
 * вопросов загружен целиком, отдельный запрос на каждую букву не нужен. */
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
      matchesSearch([item.prompt, ...item.tags], query),
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
