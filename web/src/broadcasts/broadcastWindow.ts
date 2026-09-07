// Окно журнала «Рассылки» (docs/PLAN.md §6 п.5) — переключатель периода:
// неделя / 2 недели (по умолчанию) / 8 недель (JOURNAL_RANGE_MAX_WEEKS,
// шире сервер не примет — assertJournalWindow в api/src/broadcasts/).
import { JOURNAL_RANGE_MAX_WEEKS } from '@xuanxue/shared';
import { shiftByWeeks } from '../lib/dateWindow';

export type JournalRangeWeeks = 1 | 2 | typeof JOURNAL_RANGE_MAX_WEEKS;

export interface JournalRangeOption {
  weeks: JournalRangeWeeks;
  label: string;
}

export const JOURNAL_RANGE_OPTIONS: JournalRangeOption[] = [
  { weeks: 1, label: 'Неделя' },
  { weeks: 2, label: '2 недели' },
  { weeks: JOURNAL_RANGE_MAX_WEEKS, label: `${JOURNAL_RANGE_MAX_WEEKS} недель` },
];

export const DEFAULT_JOURNAL_RANGE_WEEKS: JournalRangeWeeks = 2;

export interface JournalWindow {
  from: string;
  to: string;
}

/** `now` — параметр ради теста (CLAUDE.md «Детерминизм»). Начало окна — через
 * общий `shiftByWeeks` (lib/dateWindow.ts, pr-k3-fixes.md п.1): `setDate`
 * держал бы местную стену часов и на переходе времени Asia/Jerusalem давал
 * бы разницу не ровно N недель — сервер (`assertJournalWindow`) в UTC. */
export function journalWindow(
  weeks: JournalRangeWeeks,
  now: Date = new Date(),
): JournalWindow {
  const from = shiftByWeeks(now, -weeks);
  return { from: from.toISOString(), to: now.toISOString() };
}
