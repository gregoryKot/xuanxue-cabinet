// Query GET /broadcasts — журнал рассылок (docs/PLAN.md §6 «Рассылки»).
// Окно `from..to` обязательно и не шире JOURNAL_RANGE_MAX_WEEKS — сама
// проверка периода в broadcast-journal.ts (assertJournalWindow), не здесь:
// class-validator видит только формат ISO, не сам предел (образец —
// ListLessonsDto).
import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import {
  BROADCAST_KINDS,
  BROADCAST_STATUSES,
  type ApiRouteQuery,
  type BroadcastKind,
  type BroadcastStatus,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListBroadcastsDto implements ApiRouteQuery<'GET /broadcasts'> {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;

  @IsOptional()
  @IsIn(BROADCAST_STATUSES)
  status?: BroadcastStatus;

  @IsOptional()
  @IsIn(BROADCAST_KINDS)
  kind?: BroadcastKind;

  @ListLimit()
  limit?: number;
}
