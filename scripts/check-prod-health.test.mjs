// Тест чистого ядра check-prod-health.mjs (RUNBOOK, раздел «Мониторинг»):
// healthProblems и shouldCompareCommit — на фикстурах-объектах, без сети;
// probeHealth — с фейковыми fetchImpl/sleep, без реальных пауз и запросов.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  healthProblems,
  deployedCommitProblem,
  shouldCompareCommit,
  alertMessage,
  probeHealth,
} from './check-prod-health.mjs';

const OK_BODY = { status: 'ok', mongo: 'up', scheduler: { stale: false } };

test('healthProblems: 200 и всё живо — пусто', () => {
  assert.deepEqual(healthProblems({ status: 200, body: OK_BODY }), []);
});

test('healthProblems: код ответа не 200 — находка', () => {
  const problems = healthProblems({ status: 503, body: OK_BODY });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /503/);
});

test('healthProblems: 200, но status "degraded" — находка (несогласованный ответ)', () => {
  const problems = healthProblems({
    status: 200,
    body: { ...OK_BODY, status: 'degraded' },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /degraded/);
});

test('healthProblems: mongo не "up" — находка', () => {
  const problems = healthProblems({ status: 200, body: { ...OK_BODY, mongo: 'down' } });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /mongo/);
});

test('healthProblems: scheduler.stale true — находка со ссылкой на §8.19', () => {
  const problems = healthProblems({
    status: 200,
    body: { ...OK_BODY, scheduler: { stale: true } },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /8\.19/);
});

test('healthProblems: allowedShas — commit совпадает началом одного из них', () => {
  const body = { ...OK_BODY, commit: 'abc1234' };
  const problems = healthProblems({
    status: 200,
    body,
    allowedShas: ['abc1234567890abc1234567890abc1234567890'],
  });
  assert.deepEqual(problems, []);
});

test('healthProblems: allowedShas — commit не начало ни одного, ссылка на §8.14', () => {
  const body = { ...OK_BODY, commit: 'dead000' };
  const problems = healthProblems({
    status: 200,
    body,
    allowedShas: ['abc1234567890abc1234567890abc1234567890'],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /8\.14/);
});

test('healthProblems: allowedShas не задан — commit не проверяется вовсе', () => {
  const body = { ...OK_BODY, commit: 'anything' };
  assert.deepEqual(healthProblems({ status: 200, body }), []);
});

test('deployedCommitProblem: короткий SHA совпал с первым из списка — нет проблемы', () => {
  assert.equal(
    deployedCommitProblem({
      deployedCommit: 'abc1234',
      allowedShas: ['abc1234567890abc1234567890abc1234567890', 'deadbeef'],
    }),
    null,
  );
});

test('deployedCommitProblem: короткий SHA совпал с последним из списка — нет проблемы', () => {
  assert.equal(
    deployedCommitProblem({
      deployedCommit: 'deadbee',
      allowedShas: ['abc1234567890abc1234567890abc1234567890', 'deadbeef00000000000000'],
    }),
    null,
  );
});

test('deployedCommitProblem: не совпал ни с одним — находка со ссылкой на §8.14', () => {
  const problem = deployedCommitProblem({
    deployedCommit: 'dead000',
    allowedShas: ['abc1234567890abc1234567890abc1234567890'],
  });
  assert.match(problem, /dead000/);
  assert.match(problem, /8\.14/);
});

test('deployedCommitProblem: пустой allowedShas — сверку не делаем', () => {
  assert.equal(
    deployedCommitProblem({ deployedCommit: 'anything', allowedShas: [] }),
    null,
  );
});

test('deployedCommitProblem: deployedCommit отсутствует (undefined) при непустом allowedShas — находка', () => {
  const problem = deployedCommitProblem({
    deployedCommit: undefined,
    allowedShas: ['abc1234567890abc1234567890abc1234567890'],
  });
  assert.match(problem, /нет/);
  assert.match(problem, /8\.14/);
});

test('deployedCommitProblem: codeAgeMin, если передан, попадает в текст находки', () => {
  const problem = deployedCommitProblem({
    deployedCommit: 'dead000',
    allowedShas: ['abc1234567890abc1234567890abc1234567890'],
    codeAgeMin: 127,
  });
  assert.match(problem, /127 мин/);
});

test('healthProblems: пустое тело (сеть недоступна) — несколько находок сразу', () => {
  const problems = healthProblems({ status: 0, body: null });
  assert.equal(problems.length, 3); // код ответа, status, mongo
  assert.ok(problems.some((p) => /код ответа/.test(p)));
  assert.ok(problems.some((p) => /status/.test(p)));
  assert.ok(problems.some((p) => /mongo/.test(p)));
});

test('shouldCompareCommit: коммит младше границы — не сравнивать', () => {
  assert.equal(
    shouldCompareCommit({ headCommittedAtSec: 1000, nowSec: 1000 + 30 * 60 }),
    false,
  );
});

test('shouldCompareCommit: коммит старше границы на секунду — сравнивать', () => {
  assert.equal(
    shouldCompareCommit({ headCommittedAtSec: 1000, nowSec: 1000 + 30 * 60 + 1 }),
    true,
  );
});

test('shouldCompareCommit: свой minAgeMin меняет границу', () => {
  assert.equal(
    shouldCompareCommit({
      headCommittedAtSec: 1000,
      nowSec: 1000 + 6 * 60,
      minAgeMin: 5,
    }),
    true,
  );
});

test('alertMessage: без markdown-разметки, список проблем и опциональный runUrl', () => {
  const text = alertMessage({
    url: 'https://xuanxue.su/api/health',
    problems: ['код ответа 503, ожидали 200'],
    runUrl: 'https://github.com/x/y/actions/runs/1',
  });
  assert.match(text, /xuanxue\.su\/api\/health/);
  assert.match(text, /код ответа 503/);
  assert.match(text, /runs\/1/);
  assert.doesNotMatch(text, /[*_`#]/); // никакой markdown-разметки
});

test('alertMessage: без runUrl — строка «Прогон» не появляется', () => {
  const text = alertMessage({ url: 'https://x', problems: ['проблема'] });
  assert.doesNotMatch(text, /Прогон/);
});

test('probeHealth: первая попытка падает, вторая отвечает 200 — возвращает вторую, пауза одна', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new Error('ECONNREFUSED');
    return { status: 200, json: async () => ({ status: 'ok', mongo: 'up' }) };
  };
  const sleepCalls = [];
  const sleep = async (ms) => sleepCalls.push(ms);

  const result = await probeHealth({ url: 'https://x', fetchImpl, sleep });

  assert.equal(calls, 2);
  assert.deepEqual(sleepCalls, [5000]);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'ok');
});

test('probeHealth: первая попытка сразу отвечает 200 — без пауз, без второй попытки', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { status: 200, json: async () => ({ status: 'ok' }) };
  };
  const sleepCalls = [];
  const result = await probeHealth({
    url: 'https://x',
    fetchImpl,
    sleep: async (ms) => sleepCalls.push(ms),
  });

  assert.equal(calls, 1);
  assert.deepEqual(sleepCalls, []);
  assert.equal(result.status, 200);
});

test('probeHealth: все попытки падают — возвращает результат последней, три паузы отсутствуют, кроме двух', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  const sleepCalls = [];
  const result = await probeHealth({
    url: 'https://x',
    fetchImpl,
    sleep: async (ms) => sleepCalls.push(ms),
    attempts: 3,
  });

  assert.equal(result.status, 0);
  assert.equal(result.error, 'ECONNREFUSED');
  assert.deepEqual(sleepCalls, [5000, 15000]);
});

test('probeHealth: последняя попытка отвечает не-200 — она и возвращается', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { status: 503, json: async () => ({ status: 'degraded', mongo: 'down' }) };
  };
  const result = await probeHealth({
    url: 'https://x',
    fetchImpl,
    sleep: async () => {},
    attempts: 2,
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 503);
  assert.equal(result.body.mongo, 'down');
});
