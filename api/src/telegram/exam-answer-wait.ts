// Билдер апдейта `bot_sessions` для ожидания ответа на вопрос экзамена —
// вынесено из bot-session.service.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»): саму запись делает BotSessionService.model.updateOne
// («единственная точка записи», комментарий в шапке того файла), здесь —
// чистая функция, ЧТО записать, юнит-тест без Mongo.
import type { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { BotSessionKind } from './bot-session.schema';

// Снять видео или найти время на текст ответа можно не сразу — те же 12
// часов, что у «Запись?» (bot-session.service.ts, RECORDING_WAIT_HOURS).
const EXAM_ANSWER_WAIT_HOURS = 12;

export interface ExamAnswerWaitUpdate {
  kind: BotSessionKind;
  attemptId: Types.ObjectId;
  questionIndex: number | null;
  expiresAt: Date;
}

/** `questionIndex` — `null`, не просто отсутствие поля, когда его нет
 * (только у 'examMedia' по deep link из кабинета, ADR-0023: тот путь не
 * привязан к вопросу) — иначе номер вопроса от прошлого захода в поток
 * вопросов бота пережил бы переключение на deep link того же чата
 * (bot-session.schema.ts, комментарий у `questionIndex`). */
export function examAnswerWaitUpdate(
  kind: 'examMedia' | 'examText',
  attemptId: string,
  questionIndex: number | undefined,
  now: DateTime,
): ExamAnswerWaitUpdate {
  return {
    kind,
    attemptId: new Types.ObjectId(attemptId),
    questionIndex: questionIndex ?? null,
    expiresAt: now.plus({ hours: EXAM_ANSWER_WAIT_HOURS }).toJSDate(),
  };
}
