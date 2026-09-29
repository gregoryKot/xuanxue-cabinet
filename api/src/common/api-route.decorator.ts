// Сторона API карты маршрутов (docs/PLAN.md §17.1, ADR-0148): обработчик
// объявляет, какую запись карты он обслуживает, — `@ApiRoute('POST
// /me/inbox/:id/read')` рядом с обычным `@Post(':id/read')`.
//
// Два замка, каждый на своё:
// - `tsc`: декоратор принимает только метод, возвращающий
//   `ApiRouteResponse<K>` — сразу или промисом. Обработчик, который отдаёт 204
//   или часть DTO при записи «ответ — целая страница» (#345), не компилируется.
// - e2e на настоящем AppModule (api/test/api-routes.e2e-spec.ts) зовёт
//   findApiRouteProblems ниже: ключ карты без обработчика, обработчик с
//   ключом, который не совпал с его настоящим маршрутом Nest, — падение.
//
// Маршрут в Nest по-прежнему задают `@Controller`/`@Get`/…: по ним же читают
// текст гейты check-route-collisions.mjs и check-ownership-e2e.mjs, а
// расхождение декораторов с ключом ловит сверка, а не память автора.
import { SetMetadata } from '@nestjs/common';
import { API_ROUTE_KEYS, type ApiRouteKey, type ApiRouteResponse } from '@xuanxue/shared';

export const API_ROUTE_METADATA = 'xuanxue:api-route';

// Синхронный возврат тоже годится: Nest ждёт промис, только если он есть, и
// заставлять обработчик заворачивать ответ в `Promise.resolve` незачем.
// `never[]` — аргументы обработчика (`@Param`, `@Body`, `@CurrentUser`)
// декоратору безразличны, проверяется только возврат.
type RouteHandler<K extends ApiRouteKey> = (
  ...args: never[]
) => ApiRouteResponse<K> | Promise<ApiRouteResponse<K>>;

export function ApiRoute<K extends ApiRouteKey>(key: K) {
  return <H extends RouteHandler<K>>(
    target: object,
    property: string | symbol,
    descriptor: TypedPropertyDescriptor<H>,
  ): void => {
    SetMetadata(API_ROUTE_METADATA, key)(target, property, descriptor);
  };
}

/** Обработчик, как его зарегистрировал Nest: `route` — «МЕТОД /путь» без
 * `/api`, в том же виде, что ключ карты; `declared` — ключ из `@ApiRoute`,
 * если он есть. */
export interface RegisteredRoute {
  handler: string;
  route: string;
  declared?: string;
}

/** Расхождения карты с маршрутами Nest, по строке на каждое. Пустой список —
 * шов цел. Обработчик без `@ApiRoute` — не ошибка, пока его маршрута нет в
 * карте: перенос идёт по доменам (PLAN §17.1, шаг 2). */
export function findApiRouteProblems(
  registered: readonly RegisteredRoute[],
  keys: readonly string[] = API_ROUTE_KEYS,
): string[] {
  const problems: string[] = [];
  for (const entry of registered) {
    if (entry.declared !== undefined && entry.declared !== entry.route) {
      problems.push(
        `${entry.handler}: @ApiRoute('${entry.declared}'), а Nest регистрирует ${entry.route}`,
      );
    }
  }
  for (const key of keys) {
    const handlers = registered.filter((entry) => entry.route === key);
    if (handlers.length === 0) {
      problems.push(`${key}: в карте есть, обработчика в Nest нет`);
      continue;
    }
    for (const entry of handlers.filter((h) => h.declared !== key)) {
      problems.push(`${entry.handler}: обслуживает ${key} без @ApiRoute('${key}')`);
    }
  }
  return problems;
}
