// Чистые функции проверки и подготовки вариантов ответа — без похода в базу,
// юнит-тест без Mongo (CLAUDE.md, раздел «Тесты»). Правило combines type+
// options (ТЗ 4.2, п.2) — про сочетание полей, поэтому в сервисе, не в DTO.
import {
  EXAM_ITEM_LIMITS,
  OPTION_TEXT_OR_IMAGE_MESSAGE,
  type ExamItemKind,
  type ExamItemOptionInput,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { ExamItemOptionRecord, ExamItemVersionRecord } from './exam-item.schema';
import { keepOrGenerateId } from './sub-id';

const NO_OPTIONS_KINDS: readonly ExamItemKind[] = ['text', 'video'];
const HAS_OPTIONS_KINDS: readonly ExamItemKind[] = ['single', 'multiple'];

/**
 * Проверяет варианты против типа вопроса и возвращает нормализованный
 * список (`undefined` на входе → `[]`, чтобы вызывающему не думать про
 * отсутствие поля отдельно). Текст/видео — без вариантов вовсе; выбор
 * одного/нескольких — от `optionsMin` до `optionsMax` штук, у каждого текст
 * или картинка (ADR-0035) и нужное число отмеченных «верно».
 */
export function assertOptionsForKind(
  kind: ExamItemKind,
  options: ExamItemOptionInput[] | undefined,
): ExamItemOptionInput[] {
  const list = options ?? [];
  if (NO_OPTIONS_KINDS.includes(kind)) {
    if (list.length > 0) {
      throw new InvalidInputError(
        'У вопроса такого типа не бывает вариантов ответа. Уберите их из запроса.',
      );
    }
    return list;
  }
  if (!HAS_OPTIONS_KINDS.includes(kind)) return list;
  if (
    list.length < EXAM_ITEM_LIMITS.optionsMin ||
    list.length > EXAM_ITEM_LIMITS.optionsMax
  ) {
    throw new InvalidInputError(
      `Укажите от ${EXAM_ITEM_LIMITS.optionsMin} до ${EXAM_ITEM_LIMITS.optionsMax} вариантов ответа.`,
    );
  }
  // До подсчёта верных — пустой вариант (ни текста, ни картинки) отказывает
  // сразу самим собой, а не путается с «не тот вариант отмечен» (ADR-0035).
  if (list.some((option) => !option.text?.trim() && !option.imageId)) {
    throw new InvalidInputError(OPTION_TEXT_OR_IMAGE_MESSAGE);
  }
  const correctCount = list.filter((option) => option.correct === true).length;
  if (kind === 'single' && correctCount !== 1) {
    throw new InvalidInputError('Отметьте ровно один правильный вариант.');
  }
  if (kind === 'multiple' && correctCount < 1) {
    throw new InvalidInputError('Отметьте хотя бы один правильный вариант.');
  }
  return list;
}

/** Список для записи в базу (потом шифруется целиком через `encJson`,
 * exam-item.schema.ts). `id` есть у существующего варианта — сохраняется как
 * есть; без `id` — новый, сервис создаёт его сам (`keepOrGenerateId`,
 * sub-id.ts — тот же приём, что у блоков формы экзамена, exam-blocks.ts, и у
 * `ScheduleRuleInput`/`mapRules` в classes/classes.update.ts). */
export function mapOptions(options: ExamItemOptionInput[]): ExamItemOptionRecord[] {
  return options.map((option) => ({
    id: keepOrGenerateId(option.id),
    text: option.text?.trim() ?? '',
    correct: option.correct ?? false,
    // Ключа нет вовсе, если картинки не было — не `imageId: undefined`:
    // сравнение версий в exam-item-content-change.ts идёт по JSON.stringify
    // нормализованных записей, лишний ключ добавил бы нестабильности.
    ...(option.imageId !== undefined ? { imageId: option.imageId } : {}),
  }));
}

/** Уникальные `imageId` текущих вариантов и всех версий истории, в порядке
 * появления (Set). Плоская копия для `exam_items.imageIds` — сами
 * `options`/`history` зашифрованы целиком (`encJson`, exam-item.schema.ts) и
 * Mongo внутрь них не видит: по этому полю уборщик сирот (ADR-0035) находит,
 * какие картинки ещё используются вопросом. */
export function collectImageIds(
  options: readonly ExamItemOptionRecord[],
  history: readonly ExamItemVersionRecord[],
): string[] {
  const ids = new Set<string>();
  for (const option of options) {
    if (option.imageId) ids.add(option.imageId);
  }
  for (const version of history) {
    for (const option of version.options) {
      if (option.imageId) ids.add(option.imageId);
    }
  }
  return [...ids];
}
