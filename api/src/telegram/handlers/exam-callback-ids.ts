// Составной id кнопок вопроса/варианта внутри «действие:параметр»
// (callback-data.ts) — attemptId (24 символа ObjectId) не оставляет места в
// лимите Telegram 64 байта на callback_data, если рядом ещё и номер вопроса,
// и номер варианта, поэтому вопрос и вариант адресуются НОМЕРОМ (позицией в
// снимке попытки: `attempt.blocks[].questions[]`/`question.options[]`), не
// своим id — снимок один на всю попытку, номер между нажатиями не меняется.
// Разбор id — не второй парсер CallbackAction (тот один, в callback-data.ts):
// это расшифровка ПАРАМЕТРА уже распознанного действия, тот же уровень, что
// isNotificationKind/isMenuScreenAction у notif/menu.
import { Types } from 'mongoose';

export interface QuestionId {
  attemptId: string;
  index: number;
}

/** Индекс-сентинел «Продолжить» из списка экзаменов (exam-list-screen.ts,
 * отзыв владельца 2026-09-22, ADR-0119): список видит только положение
 * ученика (`MyExamDto`, shared/src/my-exams.ts), не снимок попытки — назвать
 * настоящий номер вопроса заранее ему нечем. Кнопка передаёт этот индекс,
 * handleExamQuestion (exam-attempt-navigation.ts) видит его и сам находит
 * первый вопрос без ответа (`firstUnansweredQuestionIndex`, shared). Занято
 * ровно одно отрицательное значение, не весь отрицательный диапазон —
 * настоящим номером вопроса «-1» быть не может, дальше parseQuestionId
 * по-прежнему отсеивает остальные отрицательные как битые данные. */
export const CONTINUE_QUESTION_INDEX = -1;

export function buildQuestionId(attemptId: string, index: number): string {
  return `${attemptId}:${index}`;
}

export function parseQuestionId(id: string): QuestionId | null {
  const [attemptId, indexRaw] = id.split(':');
  if (!attemptId || !Types.ObjectId.isValid(attemptId)) return null;
  const index = Number(indexRaw);
  if (!Number.isInteger(index)) return null;
  if (index < 0 && index !== CONTINUE_QUESTION_INDEX) return null;
  return { attemptId, index };
}

export interface OptionId {
  attemptId: string;
  questionIndex: number;
  optionIndex: number;
}

export function buildOptionId(
  attemptId: string,
  questionIndex: number,
  optionIndex: number,
): string {
  return `${attemptId}:${questionIndex}:${optionIndex}`;
}

export function parseOptionId(id: string): OptionId | null {
  const [attemptId, qRaw, oRaw] = id.split(':');
  if (!attemptId || !Types.ObjectId.isValid(attemptId)) return null;
  const questionIndex = Number(qRaw);
  const optionIndex = Number(oRaw);
  if (!Number.isInteger(questionIndex) || questionIndex < 0) return null;
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return null;
  return { attemptId, questionIndex, optionIndex };
}
