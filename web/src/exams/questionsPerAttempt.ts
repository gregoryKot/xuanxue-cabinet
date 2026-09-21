// «Вопросов ученику» (ADR-0080) — всё про одно поле в одном месте: подсказка
// под полем, валидация текста и заметка предпросмотра. Чистые функции,
// тестируются без React (CLAUDE.md «Тесты»). Число «сколько из скольких»
// для строки списка экзаменов считает examCounts.ts — оттуда же склонение.
import { pluralRu } from '@xuanxue/shared';
import { QUESTION_FORMS } from './examCounts';

/** Заметка предпросмотра «глазами ученика»: список показывает весь пул, а
 * сдающему достанется случайная часть (ADR-0080) — то же место, что у
 * SHUFFLE_QUESTIONS_NOTE (ExamPreviewQuestions.tsx). */
export function questionsPerAttemptNote(perAttempt: number, total: number): string {
  return (
    `Ученику достанутся ${perAttempt} из ${total} ` +
    `${pluralRu(total, QUESTION_FORMS)}, случайно — здесь показан весь список.`
  );
}

/** Ошибка «Вопросов ученику» больше вопросов в списке — тот же текст, что
 * отвечает сервер (api/src/exams/exam-blocks.ts): экран не должен спорить с
 * ним словами. */
function tooManyQuestionsPerAttemptMessage(perAttempt: number, total: number): string {
  return (
    `В списке ${total} ${pluralRu(total, QUESTION_FORMS)}, а ученику вы хотите ` +
    `показать ${perAttempt}. Уменьшите число или добавьте вопросы.`
  );
}

/** Валидация «Вопросов ученику» (ExamFlowFields.tsx): вызывающая сторона
 * уже отсеяла пустой текст (пусто — все вопросы) — тут целое число в
 * границах формы плюс не больше вопросов в списке. */
export function validateQuestionsPerAttemptText(
  text: string,
  min: number,
  max: number,
  questionCount: number,
): string | null {
  const value = Number(text);
  if (!Number.isInteger(value) || value < min || value > max) {
    return (
      `Вопросов ученику — целое число от ${min} до ${max}, ` +
      'либо оставьте пустым: тогда достанутся все.'
    );
  }
  if (value > questionCount)
    return tooManyQuestionsPerAttemptMessage(value, questionCount);
  return null;
}

/** Подсказка поля «Вопросов ученику» (ExamFlowFields.tsx) — число вопросов
 * списка меняется, пока учитель его редактирует, поэтому пересчитывается тут,
 * а не хранится строкой в состоянии формы. Пустой список — отдельная
 * формулировка: «все N» с N = 0 звучало бы как «ноль вопросов», а не «ещё
 * ничего не добавлено». */
export function questionsPerAttemptHint(questionCount: number): string {
  if (questionCount === 0) return 'Пусто — все вопросы списка.';
  return (
    `Пусто — все ${questionCount}. ` +
    'Иначе каждому достанутся столько случайных вопросов из списка.'
  );
}
