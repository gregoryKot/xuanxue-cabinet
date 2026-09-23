// Чистая логика формы экзамена — состояние, валидация, сборка тела запроса
// (вопросы — examQuestions.ts, срок сдачи — examDueInput.ts). timeLimitMin/
// attemptsAllowed хранятся строкой — пустое поле иначе мгновенно становится
// 0/NaN (тот же приём, что durationMinText в schedule/classFormInput.ts).
import {
  EXAM_LIMITS,
  type CreateExamInput,
  type ExamDto,
  type UpdateExamInput,
} from '@xuanxue/shared';
import { dueAtToIso, initialDueAtLocal, validateDueAtText } from './examDueInput';
import { validateQuestionsPerAttemptText } from './questionsPerAttempt';
import {
  initialQuestionIds,
  initialQuestionsPerAttempt,
  initialRequiredIds,
  initialShuffleQuestions,
  isValidInt,
  pruneRequiredIds,
  toBlockInputs,
} from './examQuestions';

// Минимумы не в EXAM_LIMITS (там только верхние границы) — та же 1 продублирована в api/src/exams/dto/*.ts.
const MIN_TIME_LIMIT_MIN = 1;
const MIN_ATTEMPTS_ALLOWED = 1;
const DEFAULT_ATTEMPTS_ALLOWED = 1;
const MIN_QUESTIONS_PER_ATTEMPT = 1;

export interface ExamFormState {
  title: string;
  description: string;
  level: string;
  timeLimitMinText: string;
  attemptsAllowedText: string;
  dueAtLocal: string;
  /** Один список вопросов на весь экзамен (ADR-0033). */
  questionIds: string[];
  /** Отметки ★ «обязательный» (ADR-0082, дополнение) — подмножество `questionIds`. */
  requiredIds: string[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** Сколько вопросов из списка достаётся сдающему — строкой по той же
   * причине, что timeLimitMinText выше; пусто — все вопросы (ADR-0082). */
  questionsPerAttemptText: string;
}

export function initialExamFormState(exam: ExamDto | null): ExamFormState {
  const questionsPerAttempt = initialQuestionsPerAttempt(exam);
  return {
    title: exam?.title ?? '',
    description: exam?.description ?? '',
    level: exam?.level ?? '',
    timeLimitMinText: exam?.timeLimitMin ? String(exam.timeLimitMin) : '',
    attemptsAllowedText: String(exam?.attemptsAllowed ?? DEFAULT_ATTEMPTS_ALLOWED),
    dueAtLocal: initialDueAtLocal(exam?.dueAt),
    questionIds: initialQuestionIds(exam),
    requiredIds: initialRequiredIds(exam),
    shuffleQuestions: initialShuffleQuestions(exam),
    shuffleOptions: exam?.shuffleOptions ?? false,
    questionsPerAttemptText:
      questionsPerAttempt !== undefined ? String(questionsPerAttempt) : '',
  };
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
  const dueAtError = validateDueAtText(state.dueAtLocal);
  if (dueAtError) return dueAtError;
  if (state.questionsPerAttemptText.trim() !== '') {
    const error = validateQuestionsPerAttemptText(
      state.questionsPerAttemptText,
      MIN_QUESTIONS_PER_ATTEMPT,
      EXAM_LIMITS.itemsPerBlockMax,
      state.questionIds.length,
      pruneRequiredIds(state.requiredIds, state.questionIds).length,
    );
    if (error) return error;
  }
  return null;
}

export function toCreateInput(state: ExamFormState): CreateExamInput {
  return {
    title: state.title.trim(),
    description: state.description.trim() || undefined,
    level: state.level.trim() || undefined,
    blocks: toBlockInputs({
      itemIds: state.questionIds,
      shuffle: state.shuffleQuestions,
      questionsPerAttempt: state.questionsPerAttemptText.trim()
        ? Number(state.questionsPerAttemptText)
        : undefined,
      requiredItemIds: state.requiredIds,
      exam: null,
    }),
    shuffleOptions: state.shuffleOptions,
    timeLimitMin: state.timeLimitMinText.trim()
      ? Number(state.timeLimitMinText)
      : undefined,
    dueAt: dueAtToIso(state.dueAtLocal),
    attemptsAllowed: Number(state.attemptsAllowedText),
  };
}

/** Пустые description/level/timeLimitMin/dueAt — явный сброс (`null`,
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
    blocks: toBlockInputs({
      itemIds: state.questionIds,
      shuffle: state.shuffleQuestions,
      questionsPerAttempt: state.questionsPerAttemptText.trim()
        ? Number(state.questionsPerAttemptText)
        : undefined,
      requiredItemIds: state.requiredIds,
      exam,
    }),
    shuffleOptions: state.shuffleOptions,
    timeLimitMin: state.timeLimitMinText.trim() ? Number(state.timeLimitMinText) : null,
    dueAt: dueAtToIso(state.dueAtLocal) ?? null,
    attemptsAllowed: Number(state.attemptsAllowedText),
  };
}
