#!/usr/bin/env node
// Плановая проверка забытых PR (CLAUDE.md, правило 1а и раздел «Зависимости»,
// ADR-0186): «агент доводит PR до конца» и «PR Dependabot не висит дольше
// недели» держались на памяти, и PR висели неделями (#310 с 2026-09-21 — это
// был драфт, #417 с 09-26, #557–#559 с 10-03). Ядро ниже — чистые функции без
// сети (тестируются в check-stale-prs.test.mjs), CLI внизу файла берёт список
// у `gh` и печатает отчёт для человека/notify-telegram.mjs.
import { spawnSync } from 'node:child_process';
import { isMainModule } from './is-main-module.mjs';

export const DEFAULT_MAX_AGE_DAYS = 7;
// Потолок выдачи `gh pr list`: он отдаёт новые PR первыми, поэтому при
// переполнении молча пропали бы как раз самые старые — см. parsePrList.
export const PR_LIST_LIMIT = 200;
// Сообщение в Telegram ограничено 4096 знаками (notify-telegram.mjs шлёт
// текст как есть): длинный хвост обрезаем, полный список — в логе прогона.
const MAX_LISTED_PRS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const GH_TIMEOUT_MS = 60_000;

function parseCreatedAt(pr) {
  const createdMs = Date.parse(pr.createdAt);
  if (Number.isNaN(createdMs)) {
    // Тихо считать такой PR свежим нельзя — гейт молча пропустил бы его.
    throw new Error(`у PR #${pr.number} нет читаемого createdAt: ${pr.createdAt}`);
  }
  return createdMs;
}

/**
 * PR, открытые дольше `maxAgeDays` суток, — от самого старого к новому.
 * Ровно `maxAgeDays` суток ещё не просрочка. Черновики считаются так же,
 * как остальные: драфт, провисевший неделями, — тот же провал (#310).
 * `nowMs` — миллисекунды эпохи, передаются снаружи ради детерминизма.
 */
export function findStalePrs(prs, nowMs, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
  return prs
    .map((pr) => ({ pr, ageMs: nowMs - parseCreatedAt(pr) }))
    .filter(({ ageMs }) => ageMs > maxAgeDays * DAY_MS)
    .sort((a, b) => b.ageMs - a.ageMs)
    .map(({ pr }) => pr);
}

function describePr(pr, nowMs) {
  const days = Math.floor((nowMs - parseCreatedAt(pr)) / DAY_MS);
  const details = [`возраст ${days} дн.`];
  if (pr.isDraft) details.push('черновик');
  if (pr.author?.login) details.push(pr.author.login);
  return `#${pr.number} (${details.join(', ')}) ${pr.title} — ${pr.url}`;
}

/**
 * Текст отчёта для человека и Telegram — plain text без разметки (как
 * alertMessage в check-prod-health.mjs). Пустой список — пустая строка.
 */
export function formatStaleReport(stale, nowMs, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
  if (stale.length === 0) return '';
  const lines = [
    `PR висят дольше ${maxAgeDays} дн.: ${stale.length}`,
    '',
    ...stale.slice(0, MAX_LISTED_PRS).map((pr) => describePr(pr, nowMs)),
  ];
  if (stale.length > MAX_LISTED_PRS) {
    lines.push(
      `… и ещё ${stale.length - MAX_LISTED_PRS}, полный список — в логе прогона`,
    );
  }
  lines.push(
    '',
    'Каждый PR стоит довести до зелёного и смержить либо закрыть с комментарием-причиной ' +
      '(CLAUDE.md, правило 1а; для Dependabot — раздел «Зависимости»).',
  );
  return lines.join('\n');
}

/**
 * Разбор stdout `gh pr list --json …`. Бросает, если это не массив или он
 * упёрся в `limit`: часть PR тогда отрезана, и отрезаны самые старые.
 */
export function parsePrList(stdout, limit = PR_LIST_LIMIT) {
  const prs = JSON.parse(stdout);
  if (!Array.isArray(prs)) throw new Error('gh вернул не список PR');
  if (prs.length >= limit) {
    throw new Error(
      `открытых PR не меньше ${limit} — список обрезан, самые старые не видны`,
    );
  }
  return prs;
}

// ---------------------------------------------------------------- CLI ----
// Подключение чистого ядра к реальному `gh` (в CI токен — GH_TOKEN из env).
// Само по себе не тестируется юнитами, как CLI check-prod-health.mjs:
// поведение проверяется прогоном workflow.

function listOpenPrs() {
  const result = spawnSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      String(PR_LIST_LIMIT),
      '--json',
      'number,title,createdAt,isDraft,author,url',
    ],
    { encoding: 'utf8', timeout: GH_TIMEOUT_MS },
  );
  if (result.error) throw new Error(`не удалось запустить gh: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `gh pr list завершился с кодом ${result.status}: ${result.stderr.trim()}`,
    );
  }
  return parsePrList(result.stdout);
}

function main() {
  const nowMs = Date.now();
  const stale = findStalePrs(listOpenPrs(), nowMs);
  if (stale.length === 0) {
    console.log(`✓ открытых PR старше ${DEFAULT_MAX_AGE_DAYS} дн. нет`);
    return;
  }
  console.log(formatStaleReport(stale, nowMs));
  process.exitCode = 1;
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (err) {
    // Без ответа от gh «всё в порядке» сказать нельзя: молчаливый пропуск —
    // худший отказ гейта. Причина идёт в stdout, её читает шаг алерта.
    console.log(
      `❌ check-stale-prs: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}
