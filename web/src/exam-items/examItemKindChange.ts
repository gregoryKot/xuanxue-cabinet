// Смена типа ответа у нового вопроса — вынесена из examItemFormInput.ts
// (файловый храповик) в отдельный модуль: логика не про форму целиком, а
// только про один переход kind → options при создании (ExamItemKindField
// меняет kind только у нового вопроса, правку существующего не трогает).
import { EXAM_ITEM_LIMITS, type ExamItemKind } from '@xuanxue/shared';
import {
  hasOptions,
  type ExamItemFormState,
  type ExamItemOptionDraft,
} from './examItemFormInput';

/** Пустые варианты по числу `optionsMin` — новый выборочный вопрос выходит
 * из формы уже с ними, а не с пустым списком: без вариантов поле «Загрузить
 * видео» у варианта не видно, пока не нажать «Добавить вариант» дважды
 * (отзыв владельца с телефона). */
function emptyOptions(): ExamItemOptionDraft[] {
  return Array.from({ length: EXAM_ITEM_LIMITS.optionsMin }, () => ({
    text: '',
    correct: false,
  }));
}

/** Варианты после смены типа при создании вопроса. Уже введённые варианты не
 * трогаем — добираем до минимума только у по-настоящему пустого списка. */
export function optionsAfterKindChange(
  kind: ExamItemKind,
  previousOptions: ExamItemOptionDraft[],
): ExamItemOptionDraft[] {
  if (!hasOptions(kind)) return previousOptions;
  if (previousOptions.length > 0) return previousOptions;
  return emptyOptions();
}

/** Обработчик смены типа для ExamItemKindField (общий для страницы вопроса и
 * QuestionInlineForm — CLAUDE.md «Одна механика — один компонент», иначе оба
 * места повторяли бы одни и те же два вызова `setField`). */
export function changeExamItemKind(
  kind: ExamItemKind,
  state: ExamItemFormState,
  setField: <K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) => void,
): void {
  setField('kind', kind);
  const nextOptions = optionsAfterKindChange(kind, state.options);
  if (nextOptions !== state.options) setField('options', nextOptions);
}
