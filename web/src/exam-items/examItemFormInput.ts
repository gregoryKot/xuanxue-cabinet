// Чистая логика формы вопроса — состояние, валидация и сборка тела запроса,
// вынесены из useExamItemForm.ts, чтобы проверять без React (CLAUDE.md
// «Тесты»), по образцу schedule/classFormInput.ts. hint/criteria/tags убраны
// из вопроса вместе с полем (ADR-0128) — форма несёт только формулировку и
// варианты ответа.
import {
  EXAM_ITEM_LIMITS,
  OPTION_TEXT_OR_IMAGE_MESSAGE,
  type CreateExamItemInput,
  type ExamItemDto,
  type ExamItemKind,
  type ExamItemOptionInput,
  type UpdateExamItemInput,
} from '@xuanxue/shared';

/** `imageId` — картинка варианта (ADR-0035): форма несёт его сквозь правку
 * как есть, иначе «открыл, поправил текст, сохранил» молча снимало бы
 * картинку с варианта — options в PATCH заменяют набор целиком. */
export interface ExamItemOptionDraft {
  id?: string;
  text: string;
  correct: boolean;
  imageId?: string;
}

export interface ExamItemFormState {
  /** Меняется только при создании — при правке форма получает kind из
   * существующего вопроса и больше его не трогает (ExamItemFormFields
   * рисует его текстом, не select'ом; ТЗ 4.2, п.1). */
  kind: ExamItemKind;
  prompt: string;
  options: ExamItemOptionDraft[];
}

const DEFAULT_KIND: ExamItemKind = 'text';

/** Тип вопроса, у которого есть варианты ответа — совпадает с
 * HAS_OPTIONS_KINDS на бэкенде (exam-item-options.ts): один источник смысла
 * пришлось бы дублировать через границу пакетов, поэтому здесь та же пара
 * значений перечислена явно ещё раз. */
export function hasOptions(kind: ExamItemKind): boolean {
  return kind === 'single' || kind === 'multiple';
}

export function initialExamItemFormState(item: ExamItemDto | null): ExamItemFormState {
  return {
    kind: item?.kind ?? DEFAULT_KIND,
    prompt: item?.prompt ?? '',
    options:
      item?.options.map((option) => ({
        id: option.id,
        text: option.text,
        correct: option.correct,
        imageId: option.imageId,
      })) ?? [],
  };
}

/** `null` — форма валидна, иначе текст первой найденной ошибки. Проверки
 * вариантов ответа зеркалят assertOptionsForKind на бэкенде
 * (exam-item-options.ts) — форма не даёт отправить то, что сервис всё равно
 * отклонит, вместо круга «сохранить → 400 → понять почему». */
export function validateExamItemForm(state: ExamItemFormState): string | null {
  if (!state.prompt.trim()) return 'Впишите формулировку вопроса.';
  if (!hasOptions(state.kind)) return null;

  if (
    state.options.length < EXAM_ITEM_LIMITS.optionsMin ||
    state.options.length > EXAM_ITEM_LIMITS.optionsMax
  ) {
    return `Укажите от ${EXAM_ITEM_LIMITS.optionsMin} до ${EXAM_ITEM_LIMITS.optionsMax} вариантов ответа.`;
  }
  // Текст или картинка — то же правило, что у сервиса (OPTION_TEXT_OR_IMAGE_MESSAGE).
  if (state.options.some((option) => !option.text.trim() && !option.imageId)) {
    return OPTION_TEXT_OR_IMAGE_MESSAGE;
  }
  const correctCount = state.options.filter((option) => option.correct).length;
  if (state.kind === 'single' && correctCount !== 1) {
    return 'Отметьте ровно один правильный вариант.';
  }
  if (state.kind === 'multiple' && correctCount < 1) {
    return 'Отметьте хотя бы один правильный вариант.';
  }
  return null;
}

/** `undefined` у типов без вариантов (text/video) — сервис отклоняет сам
 * факт присланного массива для такого типа (assertOptionsForKind), поле
 * лучше не отправлять вовсе, чем отправлять пустым. */
function toOptionsInput(state: ExamItemFormState): ExamItemOptionInput[] | undefined {
  if (!hasOptions(state.kind)) return undefined;
  return state.options.map((option) => ({
    id: option.id,
    text: option.text.trim(),
    correct: option.correct,
    imageId: option.imageId,
  }));
}

export function toCreateInput(state: ExamItemFormState): CreateExamItemInput {
  return {
    kind: state.kind,
    prompt: state.prompt.trim(),
    options: toOptionsInput(state),
  };
}

export function toUpdateInput(state: ExamItemFormState): UpdateExamItemInput {
  return {
    prompt: state.prompt.trim(),
    options: toOptionsInput(state),
  };
}
