// Вопросы без ответа на форме сдачи — чистые функции, отдельно от рендера
// ради юнит-теста без DOM (просьба владельца 2026-09-22: перед отправкой
// подсветить вопросы без ответа и спросить, точно ли ученик не хочет
// ответить). Отправку это не запирает: кабинет ученику необязателен
// (CLAUDE.md «Ноль нагрузки на ученика»), пропущенный вопрос — его право,
// наше дело — предупредить один раз.
//
// Считаем ровно по тому правилу, по которому ответ засчитывает сервер
// (`answered` в exam-attempt-review.ts): выбран хотя бы один вариант или в
// тексте есть что-то кроме пробелов. Видео-вопрос отвечает присланной
// записью, а не строкой в `answers` (ADR-0037), поэтому у него свой признак
// — та же проверка по `itemId`, что и у фонового опроса
// (attemptVideoQuestions.ts).
import {
  pluralRu,
  type AttemptAnswerDto,
  type AttemptBlockDto,
  type ExamMediaDto,
} from '@xuanxue/shared';

const QUESTION_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};

/** Ответ попытки берём функцией, а не готовым списком: на форме он живёт в
 * ref автосохранения (useAttemptAutosave.ts) и меняется на каждый символ —
 * копировать его в массив ради подсветки незачем. */
export function collectUnansweredIds(
  blocks: readonly AttemptBlockDto[],
  getAnswer: (itemId: string) => AttemptAnswerDto | undefined,
  media: readonly ExamMediaDto[],
): string[] {
  return blocks.flatMap((block) =>
    block.questions
      .filter((question) =>
        question.kind === 'video'
          ? !media.some((item) => item.itemId === question.itemId)
          : !hasAnswer(getAnswer(question.itemId)),
      )
      .map((question) => question.itemId),
  );
}

function hasAnswer(answer: AttemptAnswerDto | undefined): boolean {
  if (!answer) return false;
  return (answer.optionIds?.length ?? 0) > 0 || Boolean(answer.text?.trim());
}

/** Текст подтверждения, когда что-то осталось без ответа. Число — в тексте
 * (docs/VOICE.md: конкретика вместо обобщений); что вопросы уже подсвечены,
 * и так видно на форме — повторять незачем. */
export function formatUnansweredConfirm(count: number): string {
  const questions = `${count} ${pluralRu(count, QUESTION_FORMS)}`;
  return `Без ответа ${questions}. После отправки менять ответы будет нельзя.`;
}
