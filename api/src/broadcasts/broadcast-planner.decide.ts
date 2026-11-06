// Решение «слать ли ссылку сейчас» — чистая логика без Mongo и DI (CLAUDE.md
// «Тесты»): вынесено из сервиса ради отдельного юнит-теста и размера файла.
// Правила окна и условий — docs/PLAN.md §6 «Планировщик».
import { DateTime } from 'luxon';
import { DEFAULT_LEAD_MINUTES, type ClassFormat } from '@xuanxue/shared';
import { hasLessonLink } from '../lessons/lesson-link';
import { CANCEL_REASON } from './broadcast-cancel-reasons';

export interface DecideClassInput {
  active: boolean;
  format: ClassFormat;
  /** Группы занятия: без них занятие никуда не уходит (ADR-0195, ADR-0196). */
  groupIds?: readonly unknown[];
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
 * до `now + leadMinutes + previewMinutes` класса. Нижняя граница
 * фиксирована: если тик стоял дольше получаса, досылать ссылку в прошлое уже
 * нет смысла. Верхняя граница расширена на `previewMinutes` (настройка школы,
 * `SettingsService.get()` — не константа, CLAUDE.md «Кабинет учителя: всё
 * настраивается в интерфейсе») — `broadcast` создаётся с запасом, чтобы бот
 * успел прислать предпросмотр (PLAN.md §6) до фактической отправки: сам
 * момент отправки хранит `scheduledAt` (broadcast-planner.send.ts), не факт
 * создания документа.
 */
export function decideBroadcast(
  lesson: DecideLessonInput,
  cls: DecideClassInput | undefined,
  now: DateTime,
  previewMinutes: number,
): PlanDecision {
  const leadMinutes = cls?.leadMinutes ?? DEFAULT_LEAD_MINUTES;
  const startsAt = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' });
  const windowEnd = now.plus({ minutes: leadMinutes + previewMinutes });
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
  // Офлайн-занятию ссылка не нужна никогда (решение владельца 2026-11-06), поэтому
  // группа ему не обязательна. При обратном порядке офлайн без группы получал
  // «нет группы» и DM учителю (прод 2026-11-05/06). Формат `both` группу требует.
  if (cls.format !== 'online' && cls.format !== 'both') {
    return CANCEL_REASON.offline;
  }
  if (!cls.groupIds?.length) return CANCEL_REASON.noGroup;
  if (!hasLessonLink(lesson, cls)) return CANCEL_REASON.noLink;
  return undefined;
}
