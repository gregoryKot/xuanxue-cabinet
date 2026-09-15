// Чистая логика блоков формы экзамена — добавить/убрать блок, переименовать,
// перемешивание, добавить/убрать/переставить вопрос внутри блока (ТЗ 4.3,
// «Лист»). «Блок обязателен» ушло из контракта (ADR-0033).
// Вынесена из ExamBlocksField.tsx, чтобы проверять без React (CLAUDE.md
// «Тесты»), по образцу exam-items/examItemFormInput.ts.
import type { ExamBlockInput, ExamDto } from '@xuanxue/shared';

export interface ExamBlockDraft {
  id?: string;
  title: string;
  itemIds: string[];
  shuffle: boolean;
}

export function initialBlockDrafts(exam: ExamDto | null): ExamBlockDraft[] {
  return (
    exam?.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      itemIds: [...block.itemIds],
      shuffle: block.shuffle,
    })) ?? []
  );
}

export function toBlockInputs(blocks: ExamBlockDraft[]): ExamBlockInput[] {
  return blocks.map((block) => ({
    id: block.id,
    title: block.title.trim(),
    itemIds: block.itemIds,
    shuffle: block.shuffle,
  }));
}

function newBlockDraft(): ExamBlockDraft {
  return { title: '', itemIds: [], shuffle: false };
}

export function addBlock(blocks: ExamBlockDraft[]): ExamBlockDraft[] {
  return [...blocks, newBlockDraft()];
}

export function removeBlock(blocks: ExamBlockDraft[], index: number): ExamBlockDraft[] {
  return blocks.filter((_, i) => i !== index);
}

/** Применяет `transform` только к блоку с индексом `index`, остальные — как
 * есть. Общий приём для всех точечных правок ниже — не даёт `noUncheckedIndexedAccess`
 * поводов для `!` на `blocks[index]` (CLAUDE.md «non-null assertion —
 * предупреждение»). */
function mapBlockAt(
  blocks: ExamBlockDraft[],
  index: number,
  transform: (block: ExamBlockDraft) => ExamBlockDraft,
): ExamBlockDraft[] {
  return blocks.map((block, i) => (i === index ? transform(block) : block));
}

export function renameBlock(
  blocks: ExamBlockDraft[],
  index: number,
  title: string,
): ExamBlockDraft[] {
  return mapBlockAt(blocks, index, (block) => ({ ...block, title }));
}

export function setBlockShuffle(
  blocks: ExamBlockDraft[],
  index: number,
  shuffle: boolean,
): ExamBlockDraft[] {
  return mapBlockAt(blocks, index, (block) => ({ ...block, shuffle }));
}

/** Вопрос по всей форме, не только по текущему блоку (ТЗ 4.3, п.4 — сервер
 * тоже проверяет по всем блокам сразу, api/src/exams/exam-blocks.ts/
 * assertNoRepeatedItems). */
export function usedItemIds(blocks: ExamBlockDraft[]): Set<string> {
  return new Set(blocks.flatMap((block) => block.itemIds));
}

/** Уже добавленный вопрос не добавляется второй раз (ТЗ 4.3, «Лист»: экран не
 * должен доводить до ошибки, которую всё равно вернёт сервер) — защита здесь,
 * а не только в UI, потому что пикер и так не предлагает добавленный вопрос,
 * но вызов остаётся безопасным сам по себе. */
export function addItemToBlock(
  blocks: ExamBlockDraft[],
  index: number,
  itemId: string,
): ExamBlockDraft[] {
  if (usedItemIds(blocks).has(itemId)) return blocks;
  return mapBlockAt(blocks, index, (block) => ({
    ...block,
    itemIds: [...block.itemIds, itemId],
  }));
}

export function removeItemFromBlock(
  blocks: ExamBlockDraft[],
  index: number,
  itemId: string,
): ExamBlockDraft[] {
  return mapBlockAt(blocks, index, (block) => ({
    ...block,
    itemIds: block.itemIds.filter((id) => id !== itemId),
  }));
}

/** Меняет местами элементы `i`/`j` — на границах диапазона (i/j вне массива)
 * возвращает копию без изменений, а не бросает: вызывающая сторона (moveItemUp/
 * moveItemDown) уже проверяет границы, это последняя защита. Экспортирована
 * ради этой защитной ветки — иначе она недостижима из moveItemUp/moveItemDown
 * и не проверяется тестом (`noUncheckedIndexedAccess` требует ветку в коде
 * всё равно). */
export function swap<T>(items: T[], i: number, j: number): T[] {
  const copy = items.slice();
  const a = copy[i];
  const b = copy[j];
  if (a === undefined || b === undefined) return copy;
  copy[i] = b;
  copy[j] = a;
  return copy;
}

export function moveItemUp(
  blocks: ExamBlockDraft[],
  blockIndex: number,
  itemIndex: number,
): ExamBlockDraft[] {
  if (itemIndex <= 0) return blocks;
  return mapBlockAt(blocks, blockIndex, (block) => ({
    ...block,
    itemIds: swap(block.itemIds, itemIndex, itemIndex - 1),
  }));
}

export function moveItemDown(
  blocks: ExamBlockDraft[],
  blockIndex: number,
  itemIndex: number,
): ExamBlockDraft[] {
  return mapBlockAt(blocks, blockIndex, (block) => {
    if (itemIndex >= block.itemIds.length - 1) return block;
    return { ...block, itemIds: swap(block.itemIds, itemIndex, itemIndex + 1) };
  });
}
