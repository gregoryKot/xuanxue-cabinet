// Чистая логика формы вопроса — состояние, валидация и сборка тела запроса,
// вынесены из useExamItemForm.ts, чтобы проверять без React (CLAUDE.md
// «Тесты»), по образцу schedule/classFormInput.ts. Теги хранятся в форме
// строкой через запятую (tagsText), не массивом — иначе набранная запятая
// или пробел в конце мгновенно теряются при разборе на каждое нажатие
// клавиши (тот же приём, что durationMinText/leadMinutesText в classFormInput.ts).
import {
  EXAM_ITEM_LIMITS,
  type CreateExamItemInput,
  type ExamItemDto,
  type ExamItemKind,
  type ExamItemOptionInput,
  type UpdateExamItemInput,
} from '@xuanxue/shared';

export interface ExamItemOptionDraft {
  id?: string;
  text: string;
  correct: boolean;
}

export interface ExamItemFormState {
  /** Меняется только при создании — при правке форма получает kind из
   * существующего вопроса и больше его не трогает (ExamItemFormFields
   * рисует его текстом, не select'ом; ТЗ 4.2, п.1). */
  kind: ExamItemKind;
  prompt: string;
  hint: string;
  criteria: string;
  options: ExamItemOptionDraft[];
  tagsText: string;
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
    hint: item?.hint ?? '',
    criteria: item?.criteria ?? '',
    options:
      item?.options.map((option) => ({
        id: option.id,
        text: option.text,
        correct: option.correct,
      })) ?? [],
    tagsText: item?.tags.join(', ') ?? '',
  };
}

/** Строка через запятую → массив тегов: обрезка пробелов, пустые куски
 * выбрасываются, лишнее сверх лимита отбрасывается молча — подсказка под
 * полем (ExamItemFormFields) называет лимит заранее. */
export function parseTagsInput(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, EXAM_ITEM_LIMITS.tagsMax);
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
  if (state.options.some((option) => !option.text.trim())) {
    return 'Заполните текст каждого варианта ответа.';
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
  }));
}

export function toCreateInput(state: ExamItemFormState): CreateExamItemInput {
  return {
    kind: state.kind,
    prompt: state.prompt.trim(),
    hint: state.hint.trim() || undefined,
    criteria: state.criteria.trim() || undefined,
    options: toOptionsInput(state),
    tags: parseTagsInput(state.tagsText),
  };
}

/** Пустые hint/criteria — явный сброс (`null`, NULLABLE_EXAM_ITEM_FIELDS в
 * shared/src/exams.ts), не «оставить как было» — тот же приём, что у
 * zoomLink/zoomPassword в classFormInput.ts. */
export function toUpdateInput(state: ExamItemFormState): UpdateExamItemInput {
  return {
    prompt: state.prompt.trim(),
    hint: state.hint.trim() || null,
    criteria: state.criteria.trim() || null,
    options: toOptionsInput(state),
    tags: parseTagsInput(state.tagsText),
  };
}
