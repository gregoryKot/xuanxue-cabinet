// Карта маршрутов — контракт кабинета и API (docs/PLAN.md §17.1, ADR-0148).
// Ключ — «МЕТОД /путь» без префикса `/api`, как его видит Nest у контроллера;
// значение — типы query, тела и ответа из `shared/`. Параметры пути (`:id`)
// выводятся из самого ключа, отдельно не объявляются: разъехаться с путём им
// не из чего.
//
// Зачем: путь в `apiFetch<T>(path)` — строка, а `T` ставит рукой автор
// вызова, поэтому ни `tsc`, ни e2e (они по одну сторону шва), ни тесты web
// (они мокают apiFetch) не видели, что кабинет ждёт DTO, а сервер отдаёт 204
// (#345) или маршрута нет вовсе (2026-09-27, «Cannot GET /api/materials/:id»).
// С картой шов держат с обеих сторон: web зовёт `apiRoute(ключ)` и получает
// типы из записи (web/src/api/apiRoute.ts), контроллер объявляет обработчик
// `@ApiRoute(ключ)` и обязан вернуть `Promise<response>`
// (api/src/common/api-route.decorator.ts), а e2e на настоящем AppModule
// сверяет ключи карты с маршрутами Nest (api/test/api-routes.e2e-spec.ts).
//
// Карта растёт по доменам (PLAN §17.1, шаг 2) — новый маршрут приезжает
// сразу записью здесь.

import type { InboxPageDto, ListInboxQuery } from './inbox';
import type {
  ConfirmPaymentInput,
  ListPaymentsQuery,
  PaymentDto,
  PaymentsPageDto,
} from './payments';

export const API_ROUTE_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;
type ApiRouteMethod = (typeof API_ROUTE_METHODS)[number];

/** Форма записи. `undefined` у `query`/`body` — у маршрута их нет, и вызов
 * их передать не сможет; `response: undefined` — честный 204. */
interface ApiRouteShape {
  query: object | undefined;
  body: unknown;
  response: unknown;
}

interface ApiRouteMap {
  // Лента уведомлений (ADR-0061, ADR-0063) — образцовый домен шага 1. Три
  // действия отдают страницу ленты, а не 204: так чинил #345 и закрепил
  // ADR-0087, теперь это держит карта.
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
  // «Оплаты» (слой 2.3, ADR-0049): подтверждение и снятие отдают свежую
  // строку, а не 204 — экран кладёт её в список без второго GET (ADR-0087).
  // Снимок (`…/screenshot`) в карте нет: это байты картинки для <img src>,
  // не JSON через apiFetch.
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
}

/** Проверка формы карты на уровне типов: ключ начинается с метода и `/`,
 * значение — ApiRouteShape. Кривая запись — ошибка `tsc` здесь, а не у
 * вызывающего в другом пакете. */
type CheckedRouteMap<
  T extends {
    [K in keyof T]: K extends `${ApiRouteMethod} /${string}` ? ApiRouteShape : never;
  },
> = T;
type ApiRoutes = CheckedRouteMap<ApiRouteMap>;

export type ApiRouteKey = keyof ApiRoutes;

type PathOf<K extends string> = K extends `${string} ${infer P}` ? P : never;
type ParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

export type ApiRouteParams<K extends ApiRouteKey> = {
  [Name in ParamNames<PathOf<K>>]: string;
};
export type ApiRouteQuery<K extends ApiRouteKey> = ApiRoutes[K]['query'];
export type ApiRouteBody<K extends ApiRouteKey> = ApiRoutes[K]['body'];
export type ApiRouteResponse<K extends ApiRouteKey> = ApiRoutes[K]['response'];

/** Ключи карты в рантайме — для e2e-сверки с Nest: типы до теста не
 * доживают. `Record` заставляет `tsc` держать список ровно равным карте — ни
 * забытого ключа, ни лишнего. */
const API_ROUTE_KEY_SET: Record<ApiRouteKey, true> = {
  'GET /me/inbox': true,
  'POST /me/inbox/:id/read': true,
  'POST /me/inbox/read-all': true,
  'DELETE /me/inbox/:id': true,
  'GET /payments': true,
  'POST /payments/:userId/:month/confirm': true,
  'POST /payments/:userId/:month/revoke': true,
};

// Каст — Object.keys типизирован string[]; множество ключей выше
// проверено Record-ом.
export const API_ROUTE_KEYS = Object.keys(API_ROUTE_KEY_SET) as ApiRouteKey[];

/** Метод и шаблон пути ключа: `'POST /me/inbox/:id/read'` →
 * `{ method: 'POST', path: '/me/inbox/:id/read' }`. */
export function splitApiRouteKey(key: ApiRouteKey): {
  method: ApiRouteMethod;
  path: string;
} {
  const space = key.indexOf(' ');
  return { method: key.slice(0, space) as ApiRouteMethod, path: key.slice(space + 1) };
}

/** Путь с подставленными параметрами, каждый через encodeURIComponent: id —
 * строка из данных, и `/` в ней не должен менять маршрут. Параметра нет —
 * ошибка программиста (типы его требуют), падаем громко, а не шлём `:id`. */
export function fillApiRoutePath(path: string, params: Record<string, string>): string {
  return path.replace(/:(\w+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Нет параметра пути «${name}» для ${path}`);
    return encodeURIComponent(value);
  });
}
