// Вызов API по ключу карты маршрутов (docs/PLAN.md §17.1, ADR-0148): путь,
// метод и типы query, тела и ответа берутся из записи
// `shared/src/api-routes.ts`, а не ставятся рукой автора вызова. Опечатка в
// ключе, забытый `:id`, чужое тело или ожидание не того ответа — ошибка
// `tsc`, а не находка владельца на проде.
//
// Отдельный модуль поверх `apiFetch`, а не вторая функция в http.ts: тесты
// web мокают `apiFetch` целиком (`vi.mock('../api/http')`, test-support/
// apiFetchMock.ts) — вызов через импорт отсюда попадает в тот же мок по тому
// же пути, и тесты хуков при переносе на карту переписывать не нужно. Сеть,
// таймаут, CSRF и конверт ошибок — по-прежнему только в http.ts.
import {
  fillApiRoutePath,
  splitApiRouteKey,
  type ApiRouteBody,
  type ApiRouteKey,
  type ApiRouteParams,
  type ApiRouteQuery,
  type ApiRouteResponse,
} from '@xuanxue/shared';
import { apiFetch } from './http';

type ParamsOption<K extends ApiRouteKey> = keyof ApiRouteParams<K> extends never
  ? { params?: undefined }
  : { params: ApiRouteParams<K> };
type QueryOption<K extends ApiRouteKey> =
  ApiRouteQuery<K> extends undefined
    ? { query?: undefined }
    : { query?: ApiRouteQuery<K> };
type BodyOption<K extends ApiRouteKey> =
  ApiRouteBody<K> extends undefined ? { body?: undefined } : { body: ApiRouteBody<K> };

type RouteAddress<K extends ApiRouteKey> = ParamsOption<K> & QueryOption<K>;

export type ApiRouteInit<K extends ApiRouteKey> = RouteAddress<K> &
  BodyOption<K> & {
    signal?: AbortSignal;
    keepalive?: boolean;
    timeoutMs?: number;
  };

/** Аргумент необязателен, только когда в нём нечего требовать (нет `:id`,
 * нет тела) — иначе `tsc` не даст его забыть. */
type OptionalWhenEmpty<T> = Partial<T> extends T ? [init?: T] : [init: T];

// Значение query — число, строка или флаг; `undefined` значит «не слать».
function buildPath(
  key: ApiRouteKey,
  params: Record<string, string> | undefined,
  query: object | undefined,
): string {
  const pairs = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`);
  const path = fillApiRoutePath(splitApiRouteKey(key).path, params ?? {});
  return pairs.length > 0 ? `${path}?${pairs.join('&')}` : path;
}

/** Путь запроса без `/api` — тот же, что уйдёт в `apiFetch`. Нужен и таблице
 * предзагрузки (apiPaths.ts → routeModules.ts): ключ кэша prefetchCache.ts —
 * строка пути, и собранная другим способом она бы с ним разошлась. */
export function apiRoutePath<K extends ApiRouteKey>(
  key: K,
  ...[address]: OptionalWhenEmpty<RouteAddress<K>>
): string {
  return buildPath(key, address?.params, address?.query);
}

export function apiRoute<K extends ApiRouteKey>(
  key: K,
  ...[init]: OptionalWhenEmpty<ApiRouteInit<K>>
): Promise<ApiRouteResponse<K>> {
  const { params, query, body, ...rest } = init ?? {};
  return apiFetch<ApiRouteResponse<K>>(buildPath(key, params, query), {
    ...rest,
    method: splitApiRouteKey(key).method,
    body,
  });
}
