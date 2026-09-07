// Проверка окна и фильтра `GET /broadcasts` — чистая логика, юнит-тест без
// Mongo (CLAUDE.md «Тесты»). Проверка окна — общая (`assertWindow`,
// common/date-window.ts), свой только предел: журнал рассылок и горизонт
// планировщика — разные величины, которые не должны разъезжаться молча
// через общую константу.
import type { DateTime } from 'luxon';
import { JOURNAL_RANGE_MAX_WEEKS, type ListBroadcastsQuery } from '@xuanxue/shared';
import { assertWindow } from '../common/date-window';

export function assertJournalWindow(from: DateTime, to: DateTime): void {
  assertWindow(
    from,
    to,
    JOURNAL_RANGE_MAX_WEEKS,
    'запросите журнал по частям. Сузьте окно.',
  );
}

/** Фильтр Mongo из query — окно уже проверено `assertJournalWindow`,
 * `status`/`kind` сужают журнал, только если пришли (образец —
 * `LessonsService.list`). */
export function buildJournalFilter(
  query: Pick<ListBroadcastsQuery, 'status' | 'kind'>,
  from: DateTime,
  to: DateTime,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    scheduledAt: { $gte: from.toJSDate(), $lt: to.toJSDate() },
  };
  if (query.status !== undefined) filter.status = query.status;
  if (query.kind !== undefined) filter.kind = query.kind;
  return filter;
}
