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

export function buildQuestionId(attemptId: string, index: number): string {
  return `${attemptId}:${index}`;
}

export function parseQuestionId(id: string): QuestionId | null {
  const [attemptId, indexRaw] = id.split(':');
  if (!attemptId || !Types.ObjectId.isValid(attemptId)) return null;
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) return null;
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
