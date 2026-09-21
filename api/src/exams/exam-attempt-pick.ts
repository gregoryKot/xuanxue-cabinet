// Выборка вопросов блока для попытки (ADR-0082 + дополнение «обязательные
// вопросы») — чистые функции без похода в базу, юнит-тест без Mongo
// (CLAUDE.md «Тесты»). Вынесено из exam-attempt-snapshot.ts отдельным файлом:
// с обязательными вопросами сама выборка перестала помещаться в
// файл-лимит 150 строк (CLAUDE.md «Храповики»).
import type { ExamBlockDto } from '@xuanxue/shared';

/** Перемешивание случайным ключом (Schwartzian transform) с инъекцией
 * источника случайности — юнит-тест фиксирует порядок без гонки с настоящим
 * Math.random (в бою — он же, параметром из сервиса). `Array.sort` в Node
 * стабилен, а ключи из `random()` не совпадают на практике — распределение
 * равномерно без ручного индексного свопа (заодно не спорит с
 * `noUncheckedIndexedAccess`, CLAUDE.md «Код»). Не токен/код/nonce
 * (SECURITY §8, анти-паттерны) — обычное перемешивание вопросов экрана,
 * Math.random здесь уместен. */
export function shuffleOnce<T>(items: readonly T[], random: () => number): T[] {
  return items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

/** id из `itemIds`, отмеченные обязательными (`block.requiredItemIds`), в
 * порядке самого списка — mapBlocks (exam-blocks.ts) уже отбросил при
 * сохранении id вне `itemIds`, здесь фильтр на всякий случай тот же, что и
 * там (снимок не должен падать на рассинхроне записи). Поле не задано —
 * пустой список: «без выборки обязательные ни на что не влияют» (ADR-0082). */
function requiredSubset(
  itemIds: readonly string[],
  requiredItemIds: readonly string[] | undefined,
): string[] {
  if (requiredItemIds === undefined || requiredItemIds.length === 0) return [];
  const requiredSet = new Set(requiredItemIds);
  return itemIds.filter((id) => requiredSet.has(id));
}

/** Порядок финального набора без `shuffle`: как в `itemIds`, а не в порядке,
 * в котором вопросы попали в выборку (обязательный вперемешку со случайными
 * иначе шёл бы не по списку). */
function sortByOriginalOrder(
  ids: readonly string[],
  itemIds: readonly string[],
): string[] {
  const originalIndex = new Map(itemIds.map((id, index) => [id, index]));
  return [...ids].sort(
    (a, b) => (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0),
  );
}

/** Обязательные — всегда в выборке (без отметок список пуст, и тогда это
 * просто случайный срез); остаток до `questionsPerAttempt` добирается
 * случайно из остальных вопросов блока. С `shuffle` итоговый набор
 * перемешивается ещё раз — иначе обязательные шли бы впереди случайных, а не
 * вперемешку с ними. `assertRequiredFitsPick` (exam-blocks.ts) на сохранении
 * не пускает обязательных больше `questionsPerAttempt`, но снимок на всякий
 * случай не уходит в отрицательный срез (`Math.max(0, …)`). */
function pickWithRequired(
  itemIds: readonly string[],
  required: readonly string[],
  questionsPerAttempt: number,
  shuffle: boolean,
  random: () => number,
): string[] {
  const requiredSet = new Set(required);
  const optional = itemIds.filter((id) => !requiredSet.has(id));
  const pickCount = Math.max(0, questionsPerAttempt - required.length);
  const optionalPicked = shuffleOnce(optional, random).slice(0, pickCount);
  const combined = [...required, ...optionalPicked];
  return shuffle ? shuffleOnce(combined, random) : sortByOriginalOrder(combined, itemIds);
}

/** ADR-0082: `itemIds` блока — пул, `questionsPerAttempt` — сколько из него
 * достаётся сдающему в этой попытке. Нет поля или оно не меньше длины
 * списка — берём все (тем же порядком, что раньше: `shuffle` решает, мешать
 * ли). Иначе — обязательные (`requiredItemIds`) входят всегда, остаток
 * добирается случайно из остальных (дополнение к ADR-0082). Число больше
 * списка сервис не сохранит (exam-blocks.ts), но снимок и на нём не падает —
 * берёт все. */
export function pickQuestionIds(block: ExamBlockDto, random: () => number): string[] {
  const { itemIds, questionsPerAttempt } = block;
  if (questionsPerAttempt === undefined || questionsPerAttempt >= itemIds.length) {
    return block.shuffle ? shuffleOnce(itemIds, random) : itemIds;
  }
  const required = requiredSubset(itemIds, block.requiredItemIds);
  return pickWithRequired(itemIds, required, questionsPerAttempt, block.shuffle, random);
}
