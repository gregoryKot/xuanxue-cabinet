// Снимок формы для попытки (ADR-0022 + дополнение 2026-09-12, ТЗ 4.4, п.1) —
// чистые функции без похода в базу, юнит-тест без Mongo (CLAUDE.md «Тесты»):
// сборка снимка из текущих блоков формы и текущих редакций вопросов банка,
// которые сервис уже загрузил и расшифровал. Дальше правка формы или
// вопроса эту попытку не трогает — снимок хранит текст, не ссылку.
import type { ExamBlockDto, ExamItemDto, ExamItemOptionDto } from '@xuanxue/shared';
import type {
  AttemptBlockRecord,
  AttemptOptionRecord,
  AttemptQuestionRecord,
} from './exam-attempt.schema';

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

function toAttemptOption(option: ExamItemOptionDto): AttemptOptionRecord {
  return { id: option.id, text: option.text, correct: option.correct };
}

function toAttemptQuestion(item: ExamItemDto): AttemptQuestionRecord {
  return {
    itemId: item.id,
    version: item.version,
    kind: item.kind,
    prompt: item.prompt,
    hint: item.hint,
    criteria: item.criteria,
    options: item.options.map(toAttemptOption),
  };
}

/**
 * `itemsById` — уже загруженные и расшифрованные вопросы банка (сервис зовёт
 * `ExamItemsService.getById` на каждый id блоков перед вызовом). Вопрос,
 * которого нет среди загруженных, — программная ошибка вызывающего кода
 * (эксплуатационно невозможна: форма ссылается только на вопросы банка,
 * ExamsService.assertItemsEligible, а опубликованный вопрос не удаляется,
 * removeIfDraft), поэтому падаем явно, а не молча теряем блок.
 */
export function buildAttemptBlocks(
  blocks: readonly ExamBlockDto[],
  itemsById: ReadonlyMap<string, ExamItemDto>,
  random: () => number,
): AttemptBlockRecord[] {
  return blocks.map((block) => {
    const orderedIds = block.shuffle ? shuffleOnce(block.itemIds, random) : block.itemIds;
    return {
      id: block.id,
      title: block.title,
      required: block.required,
      questions: orderedIds.map((itemId) => {
        const item = itemsById.get(itemId);
        if (!item) {
          throw new Error(
            `buildAttemptBlocks: вопрос ${itemId} не найден среди загруженных банка`,
          );
        }
        return toAttemptQuestion(item);
      }),
    };
  });
}
