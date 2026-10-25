// Записи карты маршрутов (api-routes.ts, ADR-0148) — оплаты. Абонемент
// ученика (PLAN §15, слой 2.4): снимок уходит сырым телом картинки
// (ADR-0050), ответ — строка месяца, кабинет вписывает её без второго GET
// (ADR-0087). Свой день напоминания (ADR-0161) — PUT, ответ тоже DTO.
// Экран «Оплаты» бухгалтера и админа (слой 2.3, ADR-0049, ADR-0171):
// подтверждение и снятие отдают свежую строку, а не 204 — экран кладёт её в
// список без второго GET. Снимок (`/payments/:userId/:month/screenshot`) в
// карте нет: это байты картинки для <img src>, не JSON через apiFetch.
import type {
  ConfirmPaymentInput,
  ListPaymentsQuery,
  MyPaymentDto,
  MyPaymentReminderDto,
  MyPaymentsPageDto,
  PaymentDto,
  PaymentsPageDto,
  SetPaymentReminderDayInput,
} from './payments';
import type { RawBody } from './raw-body';

export interface PaymentsRoutes {
  'GET /payments': {
    query: ListPaymentsQuery;
    body: undefined;
    response: PaymentsPageDto;
  };
  'POST /payments/:userId/:month/confirm': {
    query: undefined;
    body: ConfirmPaymentInput;
    response: PaymentDto;
  };
  'POST /payments/:userId/:month/revoke': {
    query: undefined;
    body: undefined;
    response: PaymentDto;
  };
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
  'GET /payments': true,
  'POST /payments/:userId/:month/confirm': true,
  'POST /payments/:userId/:month/revoke': true,
  'GET /me/payments': true,
  'POST /me/payments/:month/screenshot': true,
  'PUT /me/payments/reminder-day': true,
};
