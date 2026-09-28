#!/usr/bin/env node
// Ночной выкат main → release (ADR-0142): прод раскатывает не каждый мерж,
// а коммит main, который отстоялся на стейджинге SOAK_HOURS и прошёл CI.
// Ядро ниже — чистые функции без сети/git (тестируются в
// release-candidate.test.mjs), CLI внизу подключает их к реальному git,
// GitHub REST и /api/health (.github/workflows/release.yml).
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { healthProblems } from './check-prod-health.mjs';

export const DEFAULT_SOAK_HOURS = 2;
export const DEFAULT_STAGING_HEALTH_URL = 'https://staging.xuanxue.su/api/health';
export const DEFAULT_PROD_HEALTH_URL = 'https://xuanxue.su/api/health';
const SECONDS_PER_HOUR = 3600;
const MAX_SUMMARY_COMMITS = 15;

/**
 * Коммит-кандидат в прод: самый новый коммит из `commits` (newest first),
 * который отлежался `soakHours` часов и прошёл CI зелёным. Коммит старше
 * порога с красным CI не заваливает выкат целиком — пропускаем его и ищем
 * дальше в глубину (`cancelled` — обычное дело: на main висит
 * cancel-in-progress, отменённый прогон не значит «код плохой»).
 * `soakHours: 0` — хотфикс-режим, срок отстоя не требуется.
 */
export function pickCandidate({ commits, nowSec, soakHours = DEFAULT_SOAK_HOURS }) {
  if (!commits || commits.length === 0) {
    return { sha: null, reason: 'в main нет нового после прошлого выката' };
  }

  const soakSec = soakHours * SECONDS_PER_HOUR;
  let sawFreshEnough = false;
  for (const commit of commits) {
    const ageSec = nowSec - commit.committedAtSec;
    if (ageSec < soakSec) continue; // ещё не отлежался — смотрим дальше в прошлое
    sawFreshEnough = true;
    if (commit.ci === 'success') return { sha: commit.sha, reason: null };
    // failure/cancelled/pending/none — этот коммит не годится, идём глубже.
  }

  if (!sawFreshEnough) {
    return { sha: null, reason: `все коммиты main новее ${soakHours} ч — ждём отстоя` };
  }
  return {
    sha: null,
    reason: 'ни один отстоявшийся коммит main не прошёл CI зелёным',
  };
}

/**
 * Проблема со стейджингом перед выкатом на прод — или `null`, если всё
 * хорошо. Переиспользует healthProblems (без сверки commit — она своя: нам
 * важно, что стейджинг стоит НЕ СТАРШЕ кандидата, а не на конкретном SHA).
 */
export function stagingProblem({
  stagingBody,
  stagingStatus,
  candidateIsAncestorOfStaging,
}) {
  const problems = healthProblems({ status: stagingStatus, body: stagingBody });
  if (problems.length > 0) {
    return `стейджинг нездоров: ${problems.join('; ')}`;
  }
  if (!candidateIsAncestorOfStaging) {
    return 'кандидат ещё не доехал до стейджинга — выкат подождёт';
  }
  return null;
}

/** Тег вида `prod-YYYYMMDD-HHMM`, час и минута — UTC (не пояс раннера). */
export function releaseTagName(nowSec) {
  const d = new Date(nowSec * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  return `prod-${y}${m}${day}-${hh}${mm}`;
}

/**
 * Тег перед самым новым `prod-*` тегом — дефолтная цель отката. `tags` —
 * произвольный порядок; сортируем по имени (формат YYYYMMDD-HHMM сортируется
 * лексикографически так же, как по времени). `currentSha` — если задан,
 * тег с этим SHA исключается (не откатываемся «на себя же»).
 */
export function previousReleaseTag(tags, currentSha) {
  const prodTags = (tags || [])
    .filter((t) => /^prod-\d{8}-\d{4}$/.test(t.name))
    .filter((t) => !currentSha || t.sha !== currentSha)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (prodTags.length < 2) return null; // меньше двух тегов — предыдущего нет
  return prodTags[prodTags.length - 2].name;
}

/**
 * Прод ещё не докатился до цели выката — Русский текст проблемы, иначе
 * `null`. Переиспользует healthProblems (без сверки commit — своя логика:
 * короткий SHA из /api/health сравнивается с полным `targetSha` по
 * префиксу, как в deployedCommitProblem).
 */
export function targetReachedProblem({ status, body, targetSha }) {
  const problems = healthProblems({ status, body });
  if (problems.length > 0) return problems.join('; ');
  const deployed = body?.commit;
  const matches =
    typeof deployed === 'string' &&
    deployed.length > 0 &&
    (targetSha.startsWith(deployed) ||
      deployed.startsWith(targetSha.slice(0, deployed.length)));
  if (!matches) {
    return `на проде commit "${deployed ?? 'нет'}" — ждём "${targetSha.slice(0, 7)}"`;
  }
  return null;
}

/** Текст уведомления в Telegram — plain text (notify-telegram.mjs шлёт без
 * parse_mode, см. его комментарий). */
export function summaryMessage({ mode, sha, subjectLines, tag }) {
  const shortSha = sha ? sha.slice(0, 7) : '—';
  const header =
    mode === 'rollback'
      ? `Откат прода на ${shortSha} (тег ${tag})`
      : `Прод обновлён до ${shortSha} (тег ${tag})`;
  const lines = [header, ''];
  const subjects = subjectLines || [];
  if (subjects.length === 0) {
    lines.push('Список коммитов недоступен.');
  } else {
    const shown = subjects.slice(0, MAX_SUMMARY_COMMITS);
    lines.push(...shown.map((s) => `- ${s}`));
    const rest = subjects.length - shown.length;
    if (rest > 0) lines.push(`и ещё ${rest}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI ----
// Ниже — подключение чистого ядра к реальному git/GitHub REST/сети. Само по
// себе не тестируется юнитами (тот же приём, что у check-prod-health.mjs) —
// поведение проверяется прогоном .github/workflows/release.yml.

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function writeOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  console.log(`${name}=${value}`);
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

async function githubJson(path) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
  return res.json();
}

/** conclusion последнего прогона CI по коммиту → 'success'|'failure'|
 * 'cancelled'|'pending'|'none' (прогона ещё не было). */
async function ciStatusFor(sha) {
  const data = await githubJson(
    `/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=1`,
  );
  const run = data.workflow_runs?.[0];
  if (!run) return 'none';
  if (run.status !== 'completed') return 'pending';
  if (run.conclusion === 'success') return 'success';
  if (run.conclusion === 'cancelled') return 'cancelled';
  return 'failure';
}

async function holdReason() {
  const issues = await githubJson('/issues?labels=release-hold&state=open');
  if (!issues || issues.length === 0) return null;
  return `выкат на паузе: открыт issue #${issues[0].number}`;
}

function commitsInRange(range) {
  const out = runGit(['log', range, '--format=%H %ct']);
  if (!out) return [];
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ct] = line.split(' ');
      return { sha, committedAtSec: Number(ct) };
    });
}

async function candidatesWithCi(range) {
  const commits = commitsInRange(range);
  const withCi = [];
  for (const c of commits) {
    withCi.push({ ...c, ci: await ciStatusFor(c.sha) });
  }
  return withCi;
}

async function resolveCandidate({ soakHours }) {
  const explicitSha = process.env.CANDIDATE_SHA?.trim();
  if (explicitSha) {
    const full = runGit(['rev-parse', explicitSha]) ?? explicitSha;
    const ci = await ciStatusFor(full);
    if (ci !== 'success') {
      return { sha: null, reason: `хотфикс ${full.slice(0, 7)}: CI не зелёный (${ci})` };
    }
    return { sha: full, reason: null };
  }

  const releaseExists = runGit(['rev-parse', '--verify', 'origin/release']) !== null;
  const range = releaseExists
    ? 'origin/release..origin/main'
    : '-30 origin/main'; // первая раскатка: нет release — берём хвост main
  const commits = await candidatesWithCi(range);
  const nowSec = Math.floor(Date.now() / 1000);
  return pickCandidate({ commits, nowSec, soakHours });
}

async function checkStaging(sha) {
  const url = process.env.STAGING_HEALTH_URL?.trim() || DEFAULT_STAGING_HEALTH_URL;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const stagingStatus = res?.status ?? 0;
  const stagingBody = res ? await res.json().catch(() => null) : null;
  const deployedCommit = stagingBody?.commit;
  const candidateIsAncestorOfStaging =
    typeof deployedCommit === 'string' && deployedCommit.length > 0
      ? runGit(['merge-base', '--is-ancestor', sha, deployedCommit]) !== null ||
        // короткий SHA из /api/health не всегда резолвится напрямую — на
        // такой случай считаем «совпал по префиксу» тоже достаточным.
        sha.startsWith(deployedCommit) ||
        deployedCommit.startsWith(sha.slice(0, deployedCommit.length))
      : false;
  return stagingProblem({ stagingBody, stagingStatus, candidateIsAncestorOfStaging });
}

async function runPick() {
  const soakHours = Number(process.env.SOAK_HOURS ?? DEFAULT_SOAK_HOURS);

  const hold = await holdReason();
  if (hold) {
    writeOutput('sha', '');
    writeOutput('reason', hold);
    return;
  }

  const { sha, reason } = await resolveCandidate({ soakHours });
  if (!sha) {
    writeOutput('sha', '');
    writeOutput('reason', reason ?? 'кандидат не найден');
    return;
  }

  const problem = await checkStaging(sha);
  if (problem) {
    writeOutput('sha', '');
    writeOutput('reason', problem);
    process.exitCode = 1; // стейджинг нездоров — это повод алертить, не молчать
    return;
  }

  writeOutput('sha', sha);
  writeOutput('reason', '');
}

async function main() {
  const [, , subcommand] = process.argv;
  if (subcommand === 'pick') {
    await runPick();
    return;
  }
  if (subcommand === 'wait') {
    const { runWait } = await import('./release-wait.mjs');
    await runWait();
    return;
  }
  console.error('Использование: node scripts/release-candidate.mjs pick|wait');
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(
      `❌ release-candidate: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
}
