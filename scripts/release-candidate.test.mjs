// Тест чистого ядра release-candidate.mjs (ADR-0142): на фикстурах-объектах,
// без git/сети/GitHub API — сеть подключает CLI внизу файла, она проверяется
// прогоном .github/workflows/release.yml, как у check-prod-health.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickCandidate,
  stagingProblem,
  releaseTagName,
  previousReleaseTag,
  summaryMessage,
  targetReachedProblem,
} from './release-candidate.mjs';

const HOUR = 3600;
const NOW = 1_800_000_000; // произвольная фиксированная точка отсчёта

function commit(sha, ageHours, ci) {
  return { sha, committedAtSec: NOW - ageHours * HOUR, ci };
}

test('pickCandidate: нет коммитов — «в main нет нового»', () => {
  const result = pickCandidate({ commits: [], nowSec: NOW, soakHours: 2 });
  assert.equal(result.sha, null);
  assert.match(result.reason, /нет нового/);
});

test('pickCandidate: все коммиты свежее soakHours — ждём отстоя', () => {
  const commits = [commit('a', 0.5, 'success'), commit('b', 1, 'success')];
  const result = pickCandidate({ commits, nowSec: NOW, soakHours: 2 });
  assert.equal(result.sha, null);
  assert.match(result.reason, /2 ч/);
});

test('pickCandidate: самый новый отстоявшийся зелёный коммит', () => {
  const commits = [
    commit('fresh', 0.1, 'success'), // ещё не отлежался
    commit('newest-ok', 3, 'success'),
    commit('older', 5, 'success'),
  ];
  const result = pickCandidate({ commits, nowSec: NOW, soakHours: 2 });
  assert.deepEqual(result, { sha: 'newest-ok', reason: null });
});

test('pickCandidate: красный CI у отстоявшегося — пропускаем и берём следующий зелёный', () => {
  const commits = [commit('red', 3, 'failure'), commit('green', 5, 'success')];
  const result = pickCandidate({ commits, nowSec: NOW, soakHours: 2 });
  assert.deepEqual(result, { sha: 'green', reason: null });
});

test('pickCandidate: cancelled (ручная отмена, ADR-0154) — вердикта нет, пропускаем без паники', () => {
  const commits = [commit('cancelled', 3, 'cancelled'), commit('green', 5, 'success')];
  const result = pickCandidate({ commits, nowSec: NOW, soakHours: 2 });
  assert.deepEqual(result, { sha: 'green', reason: null });
});

test('pickCandidate: ни один отстоявшийся не зелёный — явная причина', () => {
  const commits = [commit('red', 3, 'failure'), commit('pending', 5, 'pending')];
  const result = pickCandidate({ commits, nowSec: NOW, soakHours: 2 });
  assert.equal(result.sha, null);
  assert.match(result.reason, /не прошёл CI/);
});

test('pickCandidate: soakHours 0 — хотфикс, коммит без отстоя годится', () => {
  const commits = [commit('hotfix', 0, 'success')];
  const result = pickCandidate({ commits, nowSec: NOW, soakHours: 0 });
  assert.deepEqual(result, { sha: 'hotfix', reason: null });
});

const OK_BODY = { status: 'ok', mongo: 'up', scheduler: { stale: false } };

test('stagingProblem: здоров и кандидат уже на нём — нет проблемы', () => {
  const result = stagingProblem({
    stagingBody: OK_BODY,
    stagingStatus: 200,
    candidateIsAncestorOfStaging: true,
  });
  assert.equal(result, null);
});

test('stagingProblem: нездоров — текст с находками healthProblems', () => {
  const result = stagingProblem({
    stagingBody: { ...OK_BODY, mongo: 'down' },
    stagingStatus: 200,
    candidateIsAncestorOfStaging: true,
  });
  assert.match(result, /mongo/);
});

test('stagingProblem: здоров, но кандидат ещё не доехал — своя причина', () => {
  const result = stagingProblem({
    stagingBody: OK_BODY,
    stagingStatus: 200,
    candidateIsAncestorOfStaging: false,
  });
  assert.match(result, /не доехал/);
});

test('releaseTagName: UTC, без new Date(строка)', () => {
  // 2026-09-28T23:41:00Z
  const sec = Date.UTC(2026, 8, 28, 23, 41, 0) / 1000;
  assert.equal(releaseTagName(sec), 'prod-20260928-2341');
});

test('releaseTagName: месяц/день/час/минута с ведущим нулём', () => {
  const sec = Date.UTC(2026, 0, 5, 3, 7, 0) / 1000;
  assert.equal(releaseTagName(sec), 'prod-20260105-0307');
});

test('previousReleaseTag: берёт предпоследний по сортировке имени', () => {
  const tags = [
    { name: 'prod-20260920-0100', sha: 'a' },
    { name: 'prod-20260925-0100', sha: 'b' },
    { name: 'prod-20260928-0100', sha: 'c' },
  ];
  assert.equal(previousReleaseTag(tags), 'prod-20260925-0100');
});

test('previousReleaseTag: игнорирует теги не по формату prod-YYYYMMDD-HHMM', () => {
  const tags = [
    { name: 'prod-20260920-0100', sha: 'a' },
    { name: 'v1.2.3', sha: 'x' },
  ];
  assert.equal(previousReleaseTag(tags), null); // единственный prod-тег — предыдущего нет
});

test('previousReleaseTag: только один тег — предыдущего нет', () => {
  assert.equal(previousReleaseTag([{ name: 'prod-20260920-0100', sha: 'a' }]), null);
});

test('previousReleaseTag: пустой список — null', () => {
  assert.equal(previousReleaseTag([]), null);
});

test('previousReleaseTag: currentSha исключает тег текущего релиза', () => {
  const tags = [
    { name: 'prod-20260920-0100', sha: 'a' },
    { name: 'prod-20260925-0100', sha: 'b' },
    { name: 'prod-20260928-0100', sha: 'c' },
  ];
  // c — текущий (только что раскатанный), исключаем его: из a/b предыдущий — a
  assert.equal(previousReleaseTag(tags, 'c'), 'prod-20260920-0100');
});

test('summaryMessage: promote со списком коммитов', () => {
  const msg = summaryMessage({
    mode: 'promote',
    sha: 'abc1234567',
    subjectLines: ['fix: чиню баг', 'feat: новая фича'],
    tag: 'prod-20260928-2341',
  });
  assert.match(msg, /Прод обновлён до abc1234/);
  assert.match(msg, /fix: чиню баг/);
  assert.match(msg, /feat: новая фича/);
});

test('summaryMessage: длинный список — «и ещё N»', () => {
  const subjects = Array.from({ length: 20 }, (_, i) => `коммит ${i}`);
  const msg = summaryMessage({
    mode: 'promote',
    sha: 'abc',
    subjectLines: subjects,
    tag: 't',
  });
  assert.match(msg, /и ещё 5/);
});

test('summaryMessage: пустой список коммитов — явный текст, не пустота', () => {
  const msg = summaryMessage({ mode: 'promote', sha: 'abc', subjectLines: [], tag: 't' });
  assert.match(msg, /недоступен/);
});

test('summaryMessage: rollback — другой заголовок', () => {
  const msg = summaryMessage({
    mode: 'rollback',
    sha: 'deadbee',
    subjectLines: [],
    tag: 'prod-20260920-0100-rollback',
  });
  assert.match(msg, /Откат прода/);
});

test('targetReachedProblem: здоров и commit совпал по префиксу — null', () => {
  const result = targetReachedProblem({
    status: 200,
    body: { ...OK_BODY, commit: 'abc1234' },
    targetSha: 'abc1234567890abc1234567890abc1234567890',
  });
  assert.equal(result, null);
});

test('targetReachedProblem: здоров, но commit другой — ждём цель', () => {
  const result = targetReachedProblem({
    status: 200,
    body: { ...OK_BODY, commit: 'dead000' },
    targetSha: 'abc1234567890abc1234567890abc1234567890',
  });
  assert.match(result, /ждём/);
});

test('targetReachedProblem: нездоров — находки healthProblems, а не про commit', () => {
  const result = targetReachedProblem({
    status: 503,
    body: null,
    targetSha: 'abc1234567890abc1234567890abc1234567890',
  });
  assert.match(result, /503/);
});
