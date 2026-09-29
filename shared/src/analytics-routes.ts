// Записи карты маршрутов (api-routes.ts, ADR-0148) — конфиг аналитики
// (ADR-0143): открытый маршрут, по нему кабинет решает, грузить ли posthog-js.
import type { AnalyticsConfigDto } from './analytics';

export interface AnalyticsRoutes {
  'GET /analytics/config': {
    query: undefined;
    body: undefined;
    response: AnalyticsConfigDto;
  };
}

export const ANALYTICS_ROUTE_KEYS: Record<keyof AnalyticsRoutes, true> = {
  'GET /analytics/config': true,
};
