// Сборка карты маршрутов из записей доменов (ADR-0148). Новый домен — две
// строки: его `…Routes` в пересечение и `…_ROUTE_KEYS` в множество ключей.
// Форму записей и ключей проверяет api-routes.ts (CheckedRouteMap), полноту
// множества — `Record` ниже: забытый в нём домен не компилируется.
import { INBOX_ROUTE_KEYS, type InboxRoutes } from './inbox-routes';
import { PAYMENTS_ROUTE_KEYS, type PaymentsRoutes } from './payments-routes';

export type ApiRouteMap = InboxRoutes & PaymentsRoutes;

export const API_ROUTE_KEY_SET: Record<keyof ApiRouteMap, true> = {
  ...INBOX_ROUTE_KEYS,
  ...PAYMENTS_ROUTE_KEYS,
};
