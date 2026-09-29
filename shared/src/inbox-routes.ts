// Записи карты маршрутов (api-routes.ts, ADR-0148) — лента уведомлений
// (ADR-0061, ADR-0063). Три действия отдают страницу ленты, а не 204: так
// чинил #345 и закрепил ADR-0087, теперь это держит карта.
import type { InboxPageDto, ListInboxQuery } from './inbox';

export interface InboxRoutes {
  'GET /me/inbox': { query: ListInboxQuery; body: undefined; response: InboxPageDto };
  'POST /me/inbox/:id/read': {
    query: undefined;
    body: undefined;
    response: InboxPageDto;
  };
  'POST /me/inbox/read-all': {
    query: undefined;
    body: undefined;
    response: InboxPageDto;
  };
  'DELETE /me/inbox/:id': { query: undefined; body: undefined; response: InboxPageDto };
}

export const INBOX_ROUTE_KEYS: Record<keyof InboxRoutes, true> = {
  'GET /me/inbox': true,
  'POST /me/inbox/:id/read': true,
  'POST /me/inbox/read-all': true,
  'DELETE /me/inbox/:id': true,
};
