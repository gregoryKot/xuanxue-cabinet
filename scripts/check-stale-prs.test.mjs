// Тест чистого ядра check-stale-prs.mjs (ADR-0186): граница возраста, черновики,
// порядок, текст отчёта и разбор выдачи gh — на фикстурах, без сети и без gh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findStalePrs,
  formatStaleReport,
  parsePrList,
  DEFAULT_MAX_AGE_DAYS,
} from './check-stale-prs.mjs';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function pr(number, ageMs, extra = {}) {
  return {
    number,
    title: `PR ${number}`,
    createdAt: new Date(NOW - ageMs).toISOString(),
    isDraft: false,
    author: { login: 'octocat' },
    url: `https://github.com/o/r/pull/${number}`,
    ...extra,
  };
}

function numbers(prs) {
  return prs.map((p) => p.number);
}

test('findStalePrs: ровно 7 суток — ещё не просрочка', () => {
  assert.deepEqual(findStalePrs([pr(1, 7 * DAY_MS)], NOW), []);
});

test('findStalePrs: 7 суток и минута — просрочка', () => {
  assert.deepEqual(numbers(findStalePrs([pr(1, 7 * DAY_MS + MINUTE_MS)], NOW)), [1]);
});

test('findStalePrs: порог по умолчанию — 7 дней', () => {
  assert.equal(DEFAULT_MAX_AGE_DAYS, 7);
});

test('findStalePrs: свой порог maxAgeDays', () => {
  const stale = findStalePrs([pr(1, 2 * DAY_MS + MINUTE_MS), pr(2, DAY_MS)], NOW, 2);
  assert.deepEqual(numbers(stale), [1]);
});

test('findStalePrs: черновик считается наравне с остальными', () => {
  assert.deepEqual(
    numbers(findStalePrs([pr(310, 30 * DAY_MS, { isDraft: true })], NOW)),
    [310],
  );
});

test('findStalePrs: пустой список — пусто', () => {
  assert.deepEqual(findStalePrs([], NOW), []);
});

test('findStalePrs: от самого старого к новому, свежие отброшены', () => {
  const stale = findStalePrs(
    [pr(2, 9 * DAY_MS), pr(3, DAY_MS), pr(1, 40 * DAY_MS), pr(4, 20 * DAY_MS)],
    NOW,
  );
  assert.deepEqual(numbers(stale), [1, 4, 2]);
});

test('findStalePrs: нечитаемый createdAt — ошибка, а не молчаливый пропуск', () => {
  assert.throws(() => findStalePrs([pr(5, DAY_MS, { createdAt: 'вчера' })], NOW), /#5/);
});

test('formatStaleReport: пустой список — пустая строка', () => {
  assert.equal(formatStaleReport([], NOW), '');
});

test('formatStaleReport: номера, возраст, черновик, автор, ссылка и что делать', () => {
  const stale = [
    pr(310, 34 * DAY_MS + 3 * 60 * MINUTE_MS, { isDraft: true }),
    pr(557, 22 * DAY_MS, { author: { login: 'dependabot' } }),
  ];
  const report = formatStaleReport(stale, NOW);
  assert.match(report, /^PR висят дольше 7 дн.: 2/);
  assert.match(
    report,
    /#310 \(возраст 34 дн., черновик, octocat\) PR 310 — https:\/\/github\.com\/o\/r\/pull\/310/,
  );
  assert.match(report, /#557 \(возраст 22 дн., dependabot\) PR 557/);
  assert.match(
    report,
    /довести до зелёного и смержить либо закрыть с комментарием-причиной/,
  );
  assert.match(report, /правило 1а/);
});

test('formatStaleReport: длинный список обрезается с остатком', () => {
  const stale = Array.from({ length: 20 }, (_, i) => pr(i + 1, 10 * DAY_MS));
  const report = formatStaleReport(stale, NOW);
  assert.match(report, /#15 /);
  assert.doesNotMatch(report, /#16 /);
  assert.match(report, /и ещё 5/);
});

test('formatStaleReport: автор не пришёл — строка без него', () => {
  const report = formatStaleReport([pr(7, 8 * DAY_MS, { author: null })], NOW);
  assert.match(report, /#7 \(возраст 8 дн\.\) PR 7/);
});

test('parsePrList: разбирает массив', () => {
  assert.deepEqual(parsePrList('[{"number":1}]'), [{ number: 1 }]);
});

test('parsePrList: упёрся в лимит — ошибка, самые старые не видны', () => {
  assert.throws(() => parsePrList('[{},{}]', 2), /обрезан/);
});

test('parsePrList: не массив — ошибка', () => {
  assert.throws(() => parsePrList('{"message":"x"}'), /не список/);
});
