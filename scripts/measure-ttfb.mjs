#!/usr/bin/env node
// Замер TTFB по шагам (docs/PLAN.md §17.2): на проде ответ занимает 0,5–1,1 с,
// причина не установлена, а менять план Railway, регион или ставить кеш наугад
// значит лечить гипотезу за деньги. Скрипт с одной машины делит время ответа
// на «платформа + транспорт» и «база».
//
// Запуск: node scripts/measure-ttfb.mjs [url…]
// Без аргументов — стейджинг и прод. TTFB_COUNT — число запросов на маршрут.
//
// Три маршрута, каждый отвечает на свой вопрос:
// - health  GET /api/health: Mongo не трогает (только readyState соединения) и
//           вне автологов nestjs-pino. Эталон «платформа + транспорт».
// - noDb    GET /api/auth/me без cookie: AuthGuard отвечает 401 до обращения к
//           базе, но запрос попадает в автологи с responseTime. Нужен для сверки
//           с логами Railway: браузерный TTFB минус серверный responseTime —
//           это транспорт.
// - db      GET /api/auth/config: публичный, ровно одно чтение Mongo
//           (settings.findById), тоже в автологах.
// Маршруты опрашиваются вперемешку (round-robin): дрейф сети во времени
// должен делиться между ними поровну, а не ложиться на один.
//
// Ядро ниже — чистые функции без сети (тесты — measure-ttfb.test.mjs), CLI
// внизу подключает их к реальному fetch.

export const DEFAULT_TARGETS = ['https://staging.xuanxue.su', 'https://xuanxue.su'];
// Троттлинг сервера — 120 запросов в минуту на IP; /api/health вне него.
// 15 запросов на два маршрута под троттлингом — 30 в минуту, с запасом.
const DEFAULT_COUNT = 15;
// Первый запрос маршрута идёт отдельно, тёплая статистика — по остальным:
// одного тёплого замера медианой не назвать.
const MIN_COUNT = 2;
const REQUEST_TIMEOUT_MS = 15_000;
// Моложе этого порога инстанс только что стартовал (PLAN §17.2 п.5).
const FRESH_UPTIME_SEC = 300;
const EMPTY = '—';

export const ROUTES = {
  health: { path: '/api/health', expectedStatus: 200, parseJson: true },
  noDb: { path: '/api/auth/me', expectedStatus: 401, parseJson: false },
  db: { path: '/api/auth/config', expectedStatus: 200, parseJson: false },
};
export const ROUTE_KEYS = Object.keys(ROUTES);

/** Медиана; пустой массив — `null`, чётная длина — среднее двух средних. */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarize(values) {
  if (values.length === 0) return { n: 0, median: null, min: null, max: null };
  return {
    n: values.length,
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/** Сервер принимает `x-request-id` как есть и пишет в каждую строку лога — по
 * префиксу `ttfb-<runId>` эти запросы находятся в логах Railway. */
export function requestIdFor(runId, routeKey, index) {
  return `ttfb-${runId}-${routeKey}-${index}`;
}

/** Порядок запросов вперемешку: index 0 у всех маршрутов, потом 1 и т. д. */
export function buildPlan(routeKeys, count) {
  const plan = [];
  for (let index = 0; index < count; index += 1) {
    for (const routeKey of routeKeys) plan.push({ routeKey, index });
  }
  return plan;
}

/**
 * Один запрос. Время — от вызова fetch до резолва промиса (заголовки пришли,
 * это и есть TTFB). Тело потом дочитывается, чтобы соединение вернулось в пул
 * keep-alive и следующий запрос не платил за новый TLS. `now` инжектируется —
 * тест не зависит от часов.
 */
export async function timeRequest({ url, requestId, fetchImpl, now, parseJson = false }) {
  const startedAt = now();
  let res;
  let ms;
  try {
    res = await fetchImpl(url, {
      headers: { 'x-request-id': requestId },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    ms = now() - startedAt;
  } catch (err) {
    return {
      status: 0,
      ms: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const result = {
    status: res.status,
    ms,
    headers: { edge: res.headers.get('x-railway-edge') },
  };
  try {
    const buffer = await res.arrayBuffer();
    if (parseJson) result.body = JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    // Время уже снято: сорванное чтение тела замер не портит.
  }
  return result;
}

/**
 * Прогон плана по одной цели. Запрос с index 0 — `first`, в тёплую статистику
 * не входит: у самого первого запроса ещё DNS + TCP + TLS, а после простоя
 * это холодный путь. Неожиданный код и сетевая ошибка — в `errors`, в
 * статистику не берутся: это ошибка замера, а не время ответа.
 */
export async function measureTarget({ baseUrl, count, runId, fetchImpl, now }) {
  const firsts = {};
  const warmMs = {};
  const errors = {};
  for (const key of ROUTE_KEYS) {
    warmMs[key] = [];
    errors[key] = [];
  }
  let edge = null;
  let uptimeSec = null;

  for (const { routeKey, index } of buildPlan(ROUTE_KEYS, count)) {
    const route = ROUTES[routeKey];
    const res = await timeRequest({
      url: `${baseUrl}${route.path}`,
      requestId: requestIdFor(runId, routeKey, index),
      fetchImpl,
      now,
      parseJson: route.parseJson,
    });
    if (index === 0) firsts[routeKey] = res;
    if (res.status !== route.expectedStatus) {
      errors[routeKey].push({ index, status: res.status, error: res.error });
      continue;
    }
    edge ??= res.headers.edge ?? null;
    // Uptime берём с первого ответа: он показывает, был ли процесс свежим до замера.
    if (routeKey === 'health') uptimeSec ??= res.body?.uptimeSec ?? null;
    if (index > 0) warmMs[routeKey].push(res.ms);
  }

  const routes = {};
  for (const key of ROUTE_KEYS) {
    routes[key] = {
      first: firsts[key],
      warm: summarize(warmMs[key]),
      errors: errors[key],
    };
  }
  return { baseUrl, runId, routes, edge, uptimeSec };
}

const ms = (value) =>
  value === null || value === undefined ? EMPTY : `${Math.round(value)} мс`;
const diff = (a, b) => (a === null || b === null ? null : a - b);

function describeFirst(first) {
  if (!first) return EMPTY;
  return first.ms === null
    ? `ошибка сети (${first.error})`
    : `${ms(first.ms)} (код ${first.status})`;
}

/** Строки отчёта по одной цели. Вывод с `null` в медиане не считается. */
export function formatReport(result) {
  const { baseUrl, runId, routes, edge, uptimeSec } = result;
  const lines = [`== ${baseUrl} ==`];
  for (const key of ROUTE_KEYS) {
    const { first, warm } = routes[key];
    lines.push(
      `${key} (${ROUTES[key].path}): первый ${describeFirst(first)}; тёплые n=${warm.n}, ` +
        `медиана ${ms(warm.median)}, мин ${ms(warm.min)}, макс ${ms(warm.max)}`,
    );
    for (const err of routes[key].errors) {
      lines.push(
        `  ошибка замера #${err.index}: код ${err.status}${err.error ? `, ${err.error}` : ''}`,
      );
    }
  }

  const health = routes.health.warm.median;
  lines.push('Выводы (по медианам тёплых запросов):');
  lines.push(`  платформа + транспорт ≈ ${ms(health)}`);
  lines.push(`  база ≈ ${ms(diff(routes.db.warm.median, health))}`);
  lines.push(`  Nest без базы ≈ ${ms(diff(routes.noDb.warm.median, health))}`);

  const uptimeText = uptimeSec === null ? EMPTY : `${uptimeSec} с`;
  const fresh =
    uptimeSec !== null && uptimeSec < FRESH_UPTIME_SEC
      ? ' — инстанс только что стартовал, замер ловит холодный процесс (PLAN §17.2 п.5)'
      : '';
  lines.push(`x-railway-edge: ${edge ?? EMPTY}; uptimeSec: ${uptimeText}${fresh}`);
  lines.push(
    `В логах Railway искать ttfb-${runId} — поле responseTime у noDb и db; ` +
      'TTFB отсюда минус responseTime = транспорт.',
  );
  return lines;
}

// ---------------------------------------------------------------- CLI ----
// Подключение ядра к реальной сети. Юнитами не покрывается (тот же приём, что
// в check-prod-health.mjs): проверяется прогоном.

function resolveCount() {
  const parsed = Number.parseInt(process.env.TTFB_COUNT ?? '', 10);
  return Number.isFinite(parsed) ? Math.max(parsed, MIN_COUNT) : DEFAULT_COUNT;
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : DEFAULT_TARGETS;
  const count = resolveCount();
  // Метка запуска — только чтобы найти свои запросы в логах, не бизнес-логика api.
  const runId = Date.now().toString(36);

  for (const baseUrl of targets) {
    const result = await measureTarget({
      baseUrl: baseUrl.replace(/\/+$/, ''),
      count,
      runId,
      fetchImpl: fetch,
      now: () => performance.now(),
    });
    for (const line of formatReport(result)) console.log(line);
    const isRouteDead = ROUTE_KEYS.some(
      (key) => result.routes[key].errors.length >= count,
    );
    if (isRouteDead) {
      console.error(`❌ ${baseUrl}: все запросы одного из маршрутов упали`);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`❌ measure-ttfb: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
