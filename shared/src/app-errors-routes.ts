// Записи карты маршрутов (api-routes.ts, ADR-0148) — журнал сбоев: экран
// «Сбои» читает его (ADR-0132), а браузер пишет в него отчётом (ADR-0071).
// Приём отчёта — 204: отчёт о сбое не должен ждать ничего, кроме «принято».
import type { AppErrorListDto, ListAppErrorsQuery } from './app-errors';
import type { ReportClientErrorInput } from './client-errors';

export interface AppErrorsRoutes {
  'GET /dev/errors': {
    query: ListAppErrorsQuery;
    body: undefined;
    response: AppErrorListDto;
  };
  'POST /client-errors': {
    query: undefined;
    body: ReportClientErrorInput;
    response: void;
  };
}

export const APP_ERRORS_ROUTE_KEYS: Record<keyof AppErrorsRoutes, true> = {
  'GET /dev/errors': true,
  'POST /client-errors': true,
};
