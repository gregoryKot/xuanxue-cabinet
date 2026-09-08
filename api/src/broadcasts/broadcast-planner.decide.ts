// Решение «слать ли ссылку сейчас» — чистая логика без Mongo и DI (CLAUDE.md
// «Тесты»): вынесено из сервиса ради отдельного юнит-теста и размера файла.
// Правила окна и условий — docs/PLAN.md §6 «Планировщик».
import { DateTime } from 'luxon';
import { DEFAULT_LEAD_MINUTES, PREVIEW_MINUTES, type ClassFormat } from '@xuanxue/shared';
import { CANCEL_REASON } from './broadcast-cancel-reasons';

export interface DecideClassInput {
  active: boolean;
  format: ClassFormat;
  channelIds: readonly unknown[];
  zoomLink?: string;
  leadMinutes: number;
}

export interface DecideLessonInput {
  startsAt: Date;
  zoomLinkOverride?: string;
}

export type PlanDecision =
  // Ещё рано — обычный случай, лога не требует.
  | { readonly kind: 'not_due' }
  // Тик пропустил окно дольше DEFAULT_LEAD_MINUTES — тихий отказ, error в лог
  // (RUNBOOK §8.1), broadcast не создаётся вовсе.
  | { readonly kind: 'too_late' }
  // В окне, но слать нечего — cancelled-плейсхолдер с причиной закрывает
  // повторный warn на каждом тике (индекс lessonId+kind).
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'send' };

/**
 * Занятие «в окне» — `startsAt` от `now - DEFAULT_LEAD_MINUTES` (не включая)
 * до `now + leadMinutes + PREVIEW_MINUTES` класса. Нижняя граница
 * фиксирована: если тик стоял дольше получаса, досылать ссылку в прошлое уже
 * нет смысла. Верхняя граница расширена на `PREVIEW_MINUTES` — `broadcast`
 * создаётся с запасом, чтобы бот успел прислать предпросмотр (PLAN.md §6)
 * до фактической отправки: сам момент отправки хранит `scheduledAt`
 * (broadcast-planner.send.ts), не факт создания документа.
 */
export function decideBroadcast(
  lesson: DecideLessonInput,
  cls: DecideClassInput | undefined,
  now: DateTime,
): PlanDecision {
  const leadMinutes = cls?.leadMinutes ?? DEFAULT_LEAD_MINUTES;
  const startsAt = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' });
  const windowEnd = now.plus({ minutes: leadMinutes + PREVIEW_MINUTES });
  const windowStart = now.minus({ minutes: DEFAULT_LEAD_MINUTES });

  if (startsAt > windowEnd) return { kind: 'not_due' };
  if (startsAt <= windowStart) return { kind: 'too_late' };

  const reason = skipReason(lesson, cls);
  if (reason) return { kind: 'skip', reason };
  return { kind: 'send' };
}

function skipReason(
  lesson: DecideLessonInput,
  cls: DecideClassInput | undefined,
): string | undefined {
  if (!cls) return CANCEL_REASON.noClass;
  if (!cls.active) return CANCEL_REASON.classDisabled;
  if (cls.channelIds.length === 0) return CANCEL_REASON.noChannels;
  if (cls.format !== 'online' && cls.format !== 'both') {
    return CANCEL_REASON.offline;
  }
  if (!(lesson.zoomLinkOverride ?? cls.zoomLink)) return CANCEL_REASON.noLink;
  return undefined;
}
