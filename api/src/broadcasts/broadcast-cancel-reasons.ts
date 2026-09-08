// Причины автоматической отмены рассылки — один источник строк для места
// принятия решения (broadcast-planner.decide.ts, recording-broadcast.service.ts)
// и уведомления учителю (telegram/broadcast-cancel-message.ts): раньше
// 'класс выключен'/'занятие без класса в базе' были инлайн-литералами сразу в
// двух файлах (CLAUDE.md «Без магических строк»). enum не используем —
// as const объект (CLAUDE.md «Код»).
import { DEFAULT_LEAD_MINUTES } from '@xuanxue/shared';

export const CANCEL_REASON = {
  noClass: 'занятие без класса в базе',
  classDisabled: 'класс выключен',
  noChannels: 'у класса нет каналов рассылки',
  offline: 'офлайн-занятие, ссылка не рассылается',
  noLink: 'нет ссылки на занятие',
  allChannelsDisabled: 'все каналы класса выключены',
} as const;

/** Тик опоздал непоправимо (broadcast-planner.service.ts, level: 'error') —
 * единственная причина с числом внутри текста; число берётся из общей
 * константы, не дублируется. */
export const TOO_LATE_REASON = `тик опоздал: занятие началось больше ${DEFAULT_LEAD_MINUTES} минут назад`;

/** Действие, которое нужно DM учителю по причине отмены (docs/PLAN.md §6
 * «Планировщик»). Не enum — union строк (CLAUDE.md «Код»). */
export type BroadcastCancelAction =
  'no_channels' | 'channels_disabled' | 'no_link' | 'too_late';

const ACTION_BY_REASON: ReadonlyMap<string, BroadcastCancelAction> = new Map([
  [CANCEL_REASON.noChannels, 'no_channels'],
  [CANCEL_REASON.allChannelsDisabled, 'channels_disabled'],
  [CANCEL_REASON.noLink, 'no_link'],
  [TOO_LATE_REASON, 'too_late'],
]);

/**
 * `undefined` — DM учителю не нужен: `classDisabled` — его собственное
 * осознанное решение (docs/PLAN.md §6), `noClass`/`offline` и произвольные
 * тексты исключения (recording-broadcast.service.ts) — пока без
 * сформулированного действия, шум хуже молчания. Известное ограничение —
 * RUNBOOK §8.1.
 */
export function classifyCancelReason(reason: string): BroadcastCancelAction | undefined {
  return ACTION_BY_REASON.get(reason);
}
