// Билдер апдейта `bot_sessions` для ожидания скриншота оплаты (ADR-0050,
// docs/PLAN.md §15 слой 2.2) — вынесено из bot-session.service.ts (файл-лимит
// CLAUDE.md), тем же приёмом, что exam-answer-wait.ts: саму запись делает
// BotSessionService.model.updateOne («единственная точка записи», комментарий
// в шапке того файла), здесь — чистая функция, ЧТО записать, юнит-тест без
// Mongo.
import type { DateTime } from 'luxon';
import { EXAM_ANSWER_WAIT_HOURS } from './exam-answer-wait';

export interface PaymentWaitUpdate {
  kind: 'payment';
  month: string;
  expiresAt: Date;
}

/** `month` — параметром, не идентичность (SECURITY §3): владение решает
 * BotUserAccessService в момент присылки фото, а не то, что стоит в ссылке.
 * TTL — EXAM_ANSWER_WAIT_HOURS (комментарий там же). */
export function paymentWaitUpdate(month: string, now: DateTime): PaymentWaitUpdate {
  return {
    kind: 'payment',
    month,
    expiresAt: now.plus({ hours: EXAM_ANSWER_WAIT_HOURS }).toJSDate(),
  };
}
