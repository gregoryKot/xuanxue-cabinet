// Тест чистого ядра measure-ttfb.mjs (PLAN §17.2): статистика, план опроса и
// отчёт — на фикстурах; measureTarget/timeRequest — с фейковыми fetchImpl и
// now, без сети и без реальных часов.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  median,
  summarize,
  requestIdFor,
  buildPlan,
  timeRequest,
  measureTarget,
  formatReport,
  ROUTE_KEYS,
} from './measure-ttfb.mjs';

const BASE = 'https://example.test';
const CODES = { '/api/health': 200, '/api/auth/me': 401, '/api/auth/config': 200 };

/** Фейковый ответ: только то, что читает timeRequest. */
function fakeRes(status, { body = {}, edge = 'edge-1' } = {}) {
  return {
    status,
    headers: { get: (name) => (name === 'x-railway-edge' ? edge : null) },
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
  };
}

/** Часы: каждый вызов now() сдвигает время на следующее значение из списка. */
function fakeNow(deltas) {
  let t = 0;
  let call = 0;
  return () => {
    // Чётные вызовы — старт, нечётные — конец: разность равна очередной дельте.
    if (call % 2 === 1) t += deltas[Math.floor(call / 2) % deltas.length];
    call += 1;
    return t;
  };
}

test('median: пусто — null, нечётная — середина, чётная — среднее двух', () => {
  assert.equal(median([]), null);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('summarize: пусто — все null, иначе n/медиана/мин/макс', () => {
  assert.deepEqual(summarize([]), { n: 0, median: null, min: null, max: null });
  assert.deepEqual(summarize([30, 10, 20]), { n: 3, median: 20, min: 10, max: 30 });
});

test('requestIdFor: префикс ttfb-<runId> для поиска в логах', () => {
  assert.equal(requestIdFor('abc', 'db', 3), 'ttfb-abc-db-3');
});

test('buildPlan: маршруты вперемешку, index 0 у всех, потом 1', () => {
  assert.deepEqual(buildPlan(['a', 'b'], 2), [
    { routeKey: 'a', index: 0 },
    { routeKey: 'b', index: 0 },
    { routeKey: 'a', index: 1 },
    { routeKey: 'b', index: 1 },
  ]);
});

test('timeRequest: время до заголовков, тело health разобрано, request-id ушёл', async () => {
  let seen;
  const res = await timeRequest({
    url: `${BASE}/api/health`,
    requestId: 'ttfb-x-health-0',
    parseJson: true,
    now: fakeNow([42]),
    fetchImpl: async (url, init) => {
      seen = init;
      return fakeRes(200, { body: { uptimeSec: 7 } });
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.ms, 42);
  assert.equal(res.headers.edge, 'edge-1');
  assert.deepEqual(res.body, { uptimeSec: 7 });
  assert.equal(seen.headers['x-request-id'], 'ttfb-x-health-0');
  assert.ok(seen.signal instanceof AbortSignal);
});

test('timeRequest: сетевая ошибка — status 0, ms null', async () => {
  const res = await timeRequest({
    url: BASE,
    requestId: 'r',
    now: fakeNow([1]),
    fetchImpl: async () => {
      throw new Error('ECONNRESET');
    },
  });
  assert.deepEqual(res, { status: 0, ms: null, error: 'ECONNRESET' });
});

test('measureTarget: first отдельно от warm, uptime и edge с health', async () => {
  const result = await measureTarget({
    baseUrl: BASE,
    count: 3,
    runId: 'r1',
    now: fakeNow([100, 10, 20]),
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      return fakeRes(CODES[path], { body: { uptimeSec: 900 } });
    },
  });
  assert.deepEqual(ROUTE_KEYS, ['health', 'noDb', 'db']);
  for (const key of ROUTE_KEYS) {
    assert.equal(result.routes[key].warm.n, 2);
    assert.ok(result.routes[key].first.ms > 0);
    assert.deepEqual(result.routes[key].errors, []);
  }
  assert.equal(result.routes.health.first.ms, 100);
  assert.equal(result.routes.noDb.first.status, 401);
  assert.equal(result.edge, 'edge-1');
  assert.equal(result.uptimeSec, 900);
});

test('measureTarget: неожиданный код и сетевая ошибка — в errors, не в статистику', async () => {
  const result = await measureTarget({
    baseUrl: BASE,
    count: 3,
    runId: 'r1',
    now: fakeNow([5]),
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      if (path === '/api/auth/config') return fakeRes(500);
      if (path === '/api/auth/me') throw new Error('timeout');
      return fakeRes(200, { body: { uptimeSec: 1 } });
    },
  });
  assert.equal(result.routes.db.errors.length, 3);
  assert.equal(result.routes.db.errors[0].status, 500);
  assert.equal(result.routes.db.warm.n, 0);
  assert.equal(result.routes.noDb.errors[0].error, 'timeout');
  assert.equal(result.routes.noDb.first.status, 0);
  assert.equal(result.routes.health.warm.n, 2);
});

function fixture(overrides = {}) {
  const warm = (m) => ({ n: 5, median: m, min: m - 1, max: m + 1 });
  return {
    baseUrl: BASE,
    runId: 'r1',
    edge: 'europe-west4',
    uptimeSec: 3600,
    routes: {
      health: { first: { status: 200, ms: 300 }, warm: warm(100), errors: [] },
      noDb: { first: { status: 401, ms: 250 }, warm: warm(120), errors: [] },
      db: { first: { status: 200, ms: 400 }, warm: warm(450), errors: [] },
    },
    ...overrides,
  };
}

test('formatReport: база = db − health, Nest без базы = noDb − health', () => {
  const text = formatReport(fixture()).join('\n');
  assert.match(text, /база ≈ 350 мс/);
  assert.match(text, /Nest без базы ≈ 20 мс/);
  assert.match(text, /платформа \+ транспорт ≈ 100 мс/);
  assert.match(text, /ttfb-r1/);
  assert.doesNotMatch(text, /холодный процесс/);
});

test('formatReport: null в медиане — «—», вывод не считается', () => {
  const base = fixture();
  const emptyDb = {
    first: { status: 0, ms: null, error: 'x' },
    warm: summarize([]),
    errors: [],
  };
  const text = formatReport({ ...base, routes: { ...base.routes, db: emptyDb } }).join(
    '\n',
  );
  assert.match(text, /база ≈ —/);
  assert.doesNotMatch(text, /NaN/);
});

test('formatReport: uptime меньше 300 с — пометка про холодный процесс', () => {
  const text = formatReport(fixture({ uptimeSec: 120 })).join('\n');
  assert.match(text, /только что стартовал/);
  assert.match(text, /§17\.2 п\.5/);
});
