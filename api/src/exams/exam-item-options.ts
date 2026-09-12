// Чистые функции проверки и подготовки вариантов ответа — без похода в базу,
// юнит-тест без Mongo (CLAUDE.md, раздел «Тесты»). Правило combines type+
// options (ТЗ 4.2, п.2) — про сочетание полей, поэтому в сервисе, не в DTO.
import { Types } from 'mongoose';
import {
  EXAM_ITEM_LIMITS,
  type ExamItemKind,
  type ExamItemOptionInput,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { ExamItemOptionRecord } from './exam-item.schema';

const NO_OPTIONS_KINDS: readonly ExamItemKind[] = ['text', 'video'];
const HAS_OPTIONS_KINDS: readonly ExamItemKind[] = ['single', 'multiple'];

/**
 * Проверяет варианты против типа вопроса и возвращает нормализованный
 * список (`undefined` на входе → `[]`, чтобы вызывающему не думать про
 * отсутствие поля отдельно). Текст/видео — без вариантов вовсе; выбор
 * одного/нескольких — от `optionsMin` до `optionsMax` штук с нужным числом
 * отмеченных «верно».
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
 * есть; без `id` — новый, сервис создаёт его сам (тот же приём, что у
 * `ScheduleRuleInput`/`mapRules` в classes/classes.update.ts). */
export function mapOptions(options: ExamItemOptionInput[]): ExamItemOptionRecord[] {
  return options.map((option) => ({
    id: option.id ?? new Types.ObjectId().toString(),
    text: option.text,
    correct: option.correct ?? false,
  }));
}
