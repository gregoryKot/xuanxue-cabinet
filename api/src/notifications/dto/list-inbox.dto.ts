// Query GET /me/inbox — лента уведомлений кабинета (слой in-app уведомлений,
// ADR-0061). Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум LIST_LIMIT_MAX —
// «дай всё» запрещён (CLAUDE.md «API»), тот же приём, что у /me/exams.
import type { ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListInboxDto implements ApiRouteQuery<'GET /me/inbox'> {
  @ListLimit()
  limit?: number;
}
