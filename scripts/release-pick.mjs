#!/usr/bin/env node
// CLI `node scripts/release-candidate.mjs pick` — вынесен из
// release-candidate.mjs, чтобы тот не упёрся в потолок нового файла
// (CLAUDE.md, «Храповики», check-file-size-ratchet.mjs). Подключает чистое
// ядро (pickCandidate/stagingProblem) к реальному git и GitHub REST; сеть и
// git здесь не тестируются юнитами — поведение проверяется прогоном
// .github/workflows/release.yml (тот же приём, что у check-prod-health.mjs).
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import {
  pickCandidate,
  stagingProblem,
  DEFAULT_SOAK_HOURS,
  DEFAULT_STAGING_HEALTH_URL,
} from './release-candidate.mjs';

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
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

// `logArgs` — аргументы `git log` ДО `--format` как массив (не одна строка):
// `-30 origin/main` в одном элементе argv git видит как один литеральный
// ref «-30 origin/main», а не как флаг + ref.
function commitsInRange(logArgs) {
  const out = runGit(['log', ...logArgs, '--format=%H %ct']);
  if (!out) return [];
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ct] = line.split(' ');
      return { sha, committedAtSec: Number(ct) };
    });
}

async function candidatesWithCi(logArgs) {
  const commits = commitsInRange(logArgs);
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
  // Первая раскатка: release ещё не заведена — берём хвост main.
  const logArgs = releaseExists
    ? ['origin/release..origin/main']
    : ['-30', 'origin/main'];
  const commits = await candidatesWithCi(logArgs);
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

export async function runPick() {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  runPick().catch((err) => {
    console.error(`❌ release-pick: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
