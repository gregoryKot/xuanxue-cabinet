// Чистая логика формы экзамена — состояние, валидация и сборка тела запроса
// (порядок вопросов и поиск по банку — examQuestionList.ts), вынесена из
// useExamForm.ts, чтобы проверять без React (CLAUDE.md «Тесты»), по образцу
// exam-items/examItemFormInput.ts. timeLimitMin/attemptsAllowed хранятся в
// форме строкой — пустое поле иначе мгновенно становится 0/NaN, и пользователь
// не может стереть цифру, чтобы напечатать новую (тот же приём, что
// durationMinText в schedule/classFormInput.ts).
import {
  EXAM_LIMITS,
  type CreateExamInput,
  type ExamDto,
  type UpdateExamInput,
} from '@xuanxue/shared';
import {
  initialQuestionIds,
  initialShuffleQuestions,
  toBlockInputs,
} from './examQuestionList';

// Минимумы не вынесены в EXAM_LIMITS (shared) — там только верхние границы;
// то же самое минимальное значение 1 продублировано локальной константой на
// сервере (MIN_TIME_LIMIT_MIN/MIN_ATTEMPTS_ALLOWED, api/src/exams/dto/*.ts).
const MIN_TIME_LIMIT_MIN = 1;
const MIN_ATTEMPTS_ALLOWED = 1;
const DEFAULT_ATTEMPTS_ALLOWED = 1;

export interface ExamFormState {
  title: string;
  description: string;
  level: string;
  timeLimitMinText: string;
  attemptsAllowedText: string;
  /** Один список вопросов на весь экзамен (ADR-0033). */
  questionIds: string[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

export function initialExamFormState(exam: ExamDto | null): ExamFormState {
  return {
    title: exam?.title ?? '',
    description: exam?.description ?? '',
    level: exam?.level ?? '',
    timeLimitMinText: exam?.timeLimitMin ? String(exam.timeLimitMin) : '',
    attemptsAllowedText: String(exam?.attemptsAllowed ?? DEFAULT_ATTEMPTS_ALLOWED),
    questionIds: initialQuestionIds(exam),
    shuffleQuestions: initialShuffleQuestions(exam),
    shuffleOptions: exam?.shuffleOptions ?? false,
  };
}

function isValidInt(text: string, min: number, max: number): boolean {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
}

/** `null` — форма валидна, иначе текст первой найденной ошибки. Правила
 * содержимого (вопрос опубликован, не повторяется, экзамен непустой для
 * публикации) проверяет сервер — экран показывает его ответ как есть, а не
 * дублирует их здесь. */
export function validateExamForm(state: ExamFormState): string | null {
  if (!state.title.trim()) return 'Впишите название экзамена.';
  if (
    state.timeLimitMinText.trim() !== '' &&
    !isValidInt(state.timeLimitMinText, MIN_TIME_LIMIT_MIN, EXAM_LIMITS.timeLimitMinMax)
  ) {
    return (
      `Лимит времени — целое число от ${MIN_TIME_LIMIT_MIN} до ` +
      `${EXAM_LIMITS.timeLimitMinMax} минут, либо оставьте пустым.`
    );
  }
  if (
    !isValidInt(state.attemptsAllowedText, MIN_ATTEMPTS_ALLOWED, EXAM_LIMITS.attemptsMax)
  ) {
    return `Число попыток — целое число от ${MIN_ATTEMPTS_ALLOWED} до ${EXAM_LIMITS.attemptsMax}.`;
  }
  return null;
}

export function toCreateInput(state: ExamFormState): CreateExamInput {
  return {
    title: state.title.trim(),
    description: state.description.trim() || undefined,
    level: state.level.trim() || undefined,
    blocks: toBlockInputs(state.questionIds, state.shuffleQuestions, null),
    shuffleOptions: state.shuffleOptions,
    timeLimitMin: state.timeLimitMinText.trim()
      ? Number(state.timeLimitMinText)
      : undefined,
    attemptsAllowed: Number(state.attemptsAllowedText),
  };
}

/** Пустые description/level/timeLimitMin — явный сброс (`null`,
 * NULLABLE_EXAM_FIELDS в shared/src/exams.ts), не «оставить как было» — тот же
 * приём, что у hint/criteria в exam-items/examItemFormInput.ts. `exam` нужен
 * ради `id` первого блока: без него сервер завёл бы блок заново при каждом
 * сохранении. */
export function toUpdateInput(
  state: ExamFormState,
  exam: ExamDto | null,
): UpdateExamInput {
  return {
    title: state.title.trim(),
    description: state.description.trim() || null,
    level: state.level.trim() || null,
    blocks: toBlockInputs(state.questionIds, state.shuffleQuestions, exam),
    shuffleOptions: state.shuffleOptions,
    timeLimitMin: state.timeLimitMinText.trim() ? Number(state.timeLimitMinText) : null,
    attemptsAllowed: Number(state.attemptsAllowedText),
  };
}
