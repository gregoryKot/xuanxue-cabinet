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
  itemId: Types.ObjectId | null;
  expiresAt: Date;
}

/** `questionIndex`/`itemId` — `null`, не просто отсутствие поля, когда их
 * нет (deep link из кабинета без вопроса, ADR-0023/ADR-0037) — иначе номер
 * или id вопроса от прошлого захода в поток вопросов бота пережили бы
 * переключение на deep link того же чата (bot-session.schema.ts). `itemId`
 * значим только у 'examMedia' — у 'examText' вызывающий его не передаёт. */
export function examAnswerWaitUpdate(
  kind: 'examMedia' | 'examText',
  attemptId: string,
  questionIndex: number | undefined,
  now: DateTime,
  itemId?: string,
): ExamAnswerWaitUpdate {
  return {
    kind,
    attemptId: new Types.ObjectId(attemptId),
    questionIndex: questionIndex ?? null,
    itemId: itemId ? new Types.ObjectId(itemId) : null,
    expiresAt: now.plus({ hours: EXAM_ANSWER_WAIT_HOURS }).toJSDate(),
  };
}
