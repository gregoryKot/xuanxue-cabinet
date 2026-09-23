// «Вопросов ученику» (ADR-0082) — всё про одно поле в одном месте: подсказка
// под полем, валидация текста и заметка предпросмотра. Чистые функции,
// тестируются без React (CLAUDE.md «Тесты»). Число «сколько из скольких»
// для строки списка экзаменов считает examCounts.ts — оттуда же склонение.
import { pluralRu } from '@xuanxue/shared';
import { QUESTION_FORMS } from './examCounts';

/** «1 обязательный попадёт» против «2 обязательных попадут» — обычное
 * русское согласование числа с глаголом, отдельная форма только для 1. */
function requiredNote(requiredCount: number): string {
  return requiredCount === 1
    ? '**1 обязательный** попадёт каждому'
    : `**${requiredCount} обязательных** попадут каждому`;
}

/** Заметка предпросмотра «глазами ученика»: список показывает весь пул, а
 * сдающему достанется случайная часть (ADR-0082) — то же место, что у
 * shuffleNote (ExamPreviewQuestions.tsx). `requiredCount` — сколько
 * из них обязательные (ADR-0082, дополнение): они не участвуют в случайности,
 * попадают каждому, нулю — отдельного упоминания не нужно. */
export function questionsPerAttemptNote(
  perAttempt: number,
  total: number,
  requiredCount = 0,
): string {
  const questionsLabel = `${perAttempt} из ${total} ${pluralRu(total, QUESTION_FORMS)}`;
  if (requiredCount === 0) {
    return `Ученику достанутся **${questionsLabel}**, случайно — здесь показан весь список.`;
  }
  return (
    `Ученику достанутся **${questionsLabel}**, случайно; ${requiredNote(requiredCount)} — ` +
    'здесь показан весь список.'
  );
}

/** Ошибка «Вопросов ученику» больше вопросов в списке — тот же текст, что
 * отвечает сервер (api/src/exams/exam-blocks.ts): экран не должен спорить с
 * ним словами. */
function tooManyQuestionsPerAttemptMessage(perAttempt: number, total: number): string {
  return (
    `В списке **${total}** ${pluralRu(total, QUESTION_FORMS)}, а ученику вы хотите ` +
    `показать **${perAttempt}**. Уменьшите число или добавьте вопросы.`
  );
}

/** Обязательных отмечено больше, чем «Вопросов ученику» — без этой проверки
 * часть отмеченных ★ не попала бы ни одному сдающему (ADR-0082, дополнение). */
function tooManyRequiredMessage(requiredCount: number, perAttempt: number): string {
  return (
    `Обязательных вопросов **${requiredCount}**, а ученику вы показываете **${perAttempt}**. ` +
    'Уменьшите число обязательных или увеличьте «Вопросов ученику».'
  );
}

/** Валидация «Вопросов ученику» (examFormInput.ts): вызывающая сторона уже
 * отсеяла пустой текст (пусто — все вопросы) — тут целое число в границах
 * формы, не больше вопросов в списке и не меньше отмеченных обязательных
 * (`requiredCount` — уже очищенный pruneRequiredIds, по умолчанию 0 —
 * старые вызовы без отметок не должны знать об этом параметре). */
export function validateQuestionsPerAttemptText(
  text: string,
  min: number,
  max: number,
  questionCount: number,
  requiredCount = 0,
): string | null {
  const value = Number(text);
  if (!Number.isInteger(value) || value < min || value > max) {
    return (
      `Вопросов ученику — целое число от **${min}** до **${max}**, ` +
      'либо оставьте пустым: тогда достанутся все.'
    );
  }
  if (value > questionCount)
    return tooManyQuestionsPerAttemptMessage(value, questionCount);
  if (requiredCount > value) return tooManyRequiredMessage(requiredCount, value);
  return null;
}

/** Подсказка поля «Вопросов ученику» (ExamFlowFields.tsx) — число вопросов
 * списка меняется, пока учитель его редактирует, поэтому пересчитывается тут,
 * а не хранится строкой в состоянии формы. Текст объясняет поле целиком, не
 * только пустое значение (VOICE.md, отзыв владельца 2026-09-21: непонятно,
 * что вписать и зачем нужна ★). Пустой список — отдельная формулировка: у
 * «все N» с N = 0 не на что сослаться, вопросы ещё не добавлены. */
export function questionsPerAttemptHint(questionCount: number): string {
  if (questionCount === 0) {
    return 'Пусто — ученик отвечает на все вопросы списка. Впишите число — и каждому достанется **случайная часть**. Вопросы добавляются ниже.';
  }
  return (
    `Пусто — ученик отвечает на все **${questionCount}** ` +
    `${pluralRu(questionCount, QUESTION_FORMS)} списка. Впишите число — и каждому ` +
    `достанется **случайная часть** из ${questionCount}. ★ — обязательные, попадут всем.`
  );
}
