// «Вопросов ученику» (ADR-0082) — подсказка под полем и валидация текста в
// одном месте. Чистые функции, тестируются без React (CLAUDE.md «Тесты»).
// Число «сколько из скольких» для строки списка экзаменов считает
// examCounts.ts — оттуда же склонение. Заметка предпросмотра «глазами
// ученика» — exams/previewNote.ts: она о том же поле, но про другой экран
// (ExamPreviewQuestions.tsx), и текстом ближе к заметке о перемешивании
// рядом с ней, чем к подсказке/ошибке формы этого файла.
import { pluralRu } from '@xuanxue/shared';
import { QUESTION_FORMS } from './examCounts';

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

/** Текст всплывающей подсказки поля «Вопросов ученику» (ExamFlowFields.tsx,
 * components/InfoTip.tsx, ADR-0139 — раньше строка под полем) — число
 * вопросов списка меняется, пока учитель его редактирует, поэтому
 * пересчитывается тут, а не хранится строкой в состоянии формы. Текст
 * объясняет поле целиком, не только пустое значение (VOICE.md, отзыв
 * владельца 2026-09-21: непонятно, что вписать и зачем нужна ★), но короче,
 * чем было под полем — тесен поповер, а не колонка формы. Пустой список —
 * отдельная формулировка: у «все N» с N = 0 не на что сослаться, вопросы ещё
 * не добавлены. */
export function questionsPerAttemptHint(questionCount: number): string {
  if (questionCount === 0) {
    return 'Пусто — ученику достанутся все вопросы. Впишите число — и каждому **случайная часть**. Вопросы добавляются ниже.';
  }
  return (
    `Пусто — ученику достанутся все **${questionCount}** ` +
    `${pluralRu(questionCount, QUESTION_FORMS)}. Число — и каждому **случайная часть** ` +
    `из ${questionCount}. ★ — обязательные, попадут всем.`
  );
}
