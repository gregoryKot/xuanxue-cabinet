// Приватность PostHog (ADR-0143) — чистые функции, без обращения к сети.
// `import type` из posthog-js стирается сборщиком на этапе компиляции —
// рантайм-импорт самого пакета остаётся только в posthogClient.ts, а
// `before_send` при этом типизируется без кастов.
import type { CaptureResult, Properties } from 'posthog-js';
import { ROUTE_MODULES, type RouteModule } from '../app/routeModules';
import { matchRoute } from '../app/routeMatch';

/** Путь не совпал ни с одним маршрутом кабинета (или адрес вообще не
 * распарсился) — в PostHog уходит эта константа, а не сырой путь: сырой
 * путь мог быть чем угодно, вплоть до чужого токена в query, из которого
 * составили ссылку (SECURITY, минимум персональных данных). */
export const UNKNOWN_ROUTE_PATH = '/:unknown';

// Маршруты с секретом прямо в адресе (код приглашения, токен письма) — на
// них запись экрана не идёт вовсе, до всякой маскировки текста (ADR-0143):
// содержимое поля видно и замаскированному вводу, а адрес виден всегда.
const NO_RECORDING_ROUTES: ReadonlySet<RouteModule> = new Set([
  ROUTE_MODULES.join,
  ROUTE_MODULES.emailLogin,
  ROUTE_MODULES.emailConfirm,
]);

function routeTemplateFor(pathname: string): string {
  // Query и hash в пути роли не играют (matchRoute сравнивает сегменты), но
  // отбрасываем их явно — тем же путём, что sanitizeUrl ниже.
  const route = matchRoute(pathname.replace(/[?#].*$/, ''));
  return route?.path ?? UNKNOWN_ROUTE_PATH;
}

/** Адрес для события PostHog: свой origin + шаблон маршрута (без query и
 * hash — там бывают токены и коды), чужой origin (например, `$referrer`
 * внешнего сайта) — только origin, без пути. Невалидная строка не падает —
 * возвращает `UNKNOWN_ROUTE_PATH`, как и неизвестный путь. */
export function sanitizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return UNKNOWN_ROUTE_PATH;
  }
  if (parsed.origin !== window.location.origin) return parsed.origin;
  return `${parsed.origin}${routeTemplateFor(parsed.pathname)}`;
}

// Полный URL (origin + путь имеет смысл целиком) — $referrer сравнивается с
// собственным origin, чтобы отличить переход с чужого сайта.
const URL_PROPERTY_KEYS = [
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
] as const;

// Только путь — PostHog кладёт их отдельно от полного адреса при каждом
// показе экрана и при первом визите ($initial_…, $prev_pageview_…).
const PATHNAME_PROPERTY_KEYS = [
  '$pathname',
  '$initial_pathname',
  '$prev_pageview_pathname',
] as const;

// Перегрузка: у события `properties` есть всегда, у `$set`/`$set_once` — не
// всегда; так вызывающему не нужен запасной `??` на недостижимый случай.
function sanitizeProperties(properties: Properties): Properties;
function sanitizeProperties(properties: Properties | undefined): Properties | undefined;
function sanitizeProperties(properties: Properties | undefined): Properties | undefined {
  if (!properties) return properties;
  let changed = false;
  const next: Properties = { ...properties };
  for (const key of URL_PROPERTY_KEYS) {
    // `Property` (тип значения `Properties`) — `any` в posthog-js: сужаем
    // явно перед использованием, иначе eslint видит присваивание `any`.
    const value: unknown = next[key];
    if (typeof value === 'string') {
      next[key] = sanitizeUrl(value);
      changed = true;
    }
  }
  for (const key of PATHNAME_PROPERTY_KEYS) {
    const value: unknown = next[key];
    if (typeof value === 'string') {
      next[key] = routeTemplateFor(value);
      changed = true;
    }
  }
  return changed ? next : properties;
}

/** `before_send` PostHog (posthogOptions.ts) — маскирует URL-поля события
 * до отправки: путь маршрута вместо сырого адреса, чужой origin — без пути.
 * Событие записи (`$snapshot`) тоже проходит через `before_send`
 * (посмотрено в исходниках posthog-js: капчур снимка не минует общий
 * конвейер), но у него нет этих полей верхнего уровня — сама запись
 * (`$snapshot_data`) не трогается. */
export function sanitizeEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  return {
    ...event,
    properties: sanitizeProperties(event.properties),
    $set: sanitizeProperties(event.$set),
    $set_once: sanitizeProperties(event.$set_once),
  };
}

/** Запись сессии не идёт на маршрутах входа/приглашения (ADR-0143) — по
 * записи таблицы `ROUTE_MODULES`, не по строковому литералу пути: развод по
 * значению из той же таблицы, что строит навигацию (CLAUDE.md «Одна
 * механика — один компонент»). */
export function isRecordingAllowed(pathname: string): boolean {
  const route = matchRoute(pathname);
  return route === null || !NO_RECORDING_ROUTES.has(route);
}
