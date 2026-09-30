// Записи карты маршрутов (api-routes.ts, ADR-0148) — оплаты. Абонемент
// ученика (PLAN §15, слой 2.4): снимок уходит сырым телом картинки
// (ADR-0050), ответ — строка месяца, кабинет вписывает её без второго GET
// (ADR-0087). Свой день напоминания (ADR-0160) — PUT, ответ тоже DTO.
import type {
  MyPaymentDto,
  MyPaymentReminderDto,
  MyPaymentsPageDto,
  SetPaymentReminderDayInput,
} from './payments';
import type { RawBody } from './raw-body';

export interface PaymentsRoutes {
  'GET /me/payments': { query: undefined; body: undefined; response: MyPaymentsPageDto };
  'POST /me/payments/:month/screenshot': {
    query: undefined;
    body: RawBody;
    response: MyPaymentDto;
  };
  'PUT /me/payments/reminder-day': {
    query: undefined;
    body: SetPaymentReminderDayInput;
    response: MyPaymentReminderDto;
  };
}

export const PAYMENTS_ROUTE_KEYS: Record<keyof PaymentsRoutes, true> = {
  'GET /me/payments': true,
  'POST /me/payments/:month/screenshot': true,
  'PUT /me/payments/reminder-day': true,
};
