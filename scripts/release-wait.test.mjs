// Тест чистого ядра release-wait.mjs: waitForTarget с фейковыми
// fetchImpl/sleep — без реальных пауз и сети.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForTarget } from './release-wait.mjs';

const TARGET = 'abc1234567890abc1234567890abc1234567890';
const OK_BODY = { status: 'ok', mongo: 'up', scheduler: { stale: false }, commit: 'abc1234' };

test('waitForTarget: первый же ответ уже на цели — сразу успех, без сна', async () => {
  let sleepCalls = 0;
  const result = await waitForTarget({
    url: 'https://x/api/health',
    targetSha: TARGET,
    fetchImpl: async () => ({ status: 200, body: OK_BODY }),
    sleep: async () => {
      sleepCalls += 1;
    },
  });
  assert.deepEqual(result, { ok: true, problem: null });
  assert.equal(sleepCalls, 0);
});

test('waitForTarget: докатывается со второй попытки', async () => {
  let call = 0;
  const result = await waitForTarget({
    url: 'https://x/api/health',
    targetSha: TARGET,
    fetchImpl: async () => {
      call += 1;
      if (call === 1) return { status: 200, body: { ...OK_BODY, commit: 'old0000' } };
      return { status: 200, body: OK_BODY };
    },
    sleep: async () => {},
  });
  assert.deepEqual(result, { ok: true, problem: null });
  assert.equal(call, 2);
});

test('waitForTarget: дедлайн истёк — ok:false с последней причиной', async () => {
  const result = await waitForTarget({
    url: 'https://x/api/health',
    targetSha: TARGET,
    fetchImpl: async () => ({ status: 200, body: { ...OK_BODY, commit: 'old0000' } }),
    sleep: async () => {},
    pollIntervalMs: 10,
    maxWaitMs: 25,
  });
  assert.equal(result.ok, false);
  assert.match(result.problem, /ждём/);
});

test('waitForTarget: сетевая ошибка — не бросает, продолжает опрос', async () => {
  let call = 0;
  const result = await waitForTarget({
    url: 'https://x/api/health',
    targetSha: TARGET,
    fetchImpl: async () => {
      call += 1;
      if (call === 1) throw new Error('таймаут сети');
      return { status: 200, body: OK_BODY };
    },
    sleep: async () => {},
  });
  assert.deepEqual(result, { ok: true, problem: null });
});
