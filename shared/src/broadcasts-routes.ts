// Записи карты маршрутов (api-routes.ts, ADR-0148) — «Рассылки»: журнал и
// разовая рассылка (`/broadcasts`), доставки (`/deliveries`) и числа за
// период вверху экрана (`/summary`, ADR-0025 — блок только читает). Сюда
// попали только маршруты, которые зовёт кабинет: `GET /broadcasts/:id` ему
// не нужен и в карту приедет вместе с первым вызовом. Отмена и отметка
// «отправлено» отдают целую запись, а не 204 (ADR-0087) — кабинет вписывает
// её без второго GET.
import type {
  BroadcastDto,
  CreateBroadcastInput,
  DeliveryDto,
  ListBroadcastsQuery,
  ListDeliveriesQuery,
} from './broadcasts';
import type { SummaryDto } from './summary';

export interface BroadcastsRoutes {
  'GET /broadcasts': {
    query: ListBroadcastsQuery;
    body: undefined;
    response: BroadcastDto[];
  };
  'POST /broadcasts': {
    query: undefined;
    body: CreateBroadcastInput;
    response: BroadcastDto;
  };
  'GET /broadcasts/:id/deliveries': {
    query: undefined;
    body: undefined;
    response: DeliveryDto[];
  };
  'POST /broadcasts/:id/cancel': {
    query: undefined;
    body: undefined;
    response: BroadcastDto;
  };
  'GET /deliveries': {
    query: ListDeliveriesQuery;
    body: undefined;
    response: DeliveryDto[];
  };
  'GET /deliveries/:id': { query: undefined; body: undefined; response: DeliveryDto };
  'POST /deliveries/:id/mark-sent': {
    query: undefined;
    body: undefined;
    response: DeliveryDto;
  };
  'GET /summary': { query: undefined; body: undefined; response: SummaryDto };
}

export const BROADCASTS_ROUTE_KEYS: Record<keyof BroadcastsRoutes, true> = {
  'GET /broadcasts': true,
  'POST /broadcasts': true,
  'GET /broadcasts/:id/deliveries': true,
  'POST /broadcasts/:id/cancel': true,
  'GET /deliveries': true,
  'GET /deliveries/:id': true,
  'POST /deliveries/:id/mark-sent': true,
  'GET /summary': true,
};
