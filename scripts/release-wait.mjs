#!/usr/bin/env node
// CLI `node scripts/release-candidate.mjs wait` — вынесен в отдельный файл,
// чтобы release-candidate.mjs не упёрся в потолок нового файла (CLAUDE.md,
// «Храповики», check-file-size-ratchet.mjs). После пуша release прод должен
// докатиться сам (Railway слушает ветку) — этот шаг ждёт и алертит, если
// раскатка зависла, вместо того чтобы workflow молча посчитал выкат успешным
// сразу после git push.
import { targetReachedProblem } from './release-candidate.mjs';

const POLL_INTERVAL_MS = 20_000;
const MAX_WAIT_MS = 15 * 60 * 1000;

/** Опрашивает `url` пока `targetReachedProblem` не вернёт `null`, либо пока
 * не истечёт `maxWaitMs`. `fetchImpl`/`sleep` инжектируются ради тестов. */
export async function waitForTarget({
  url,
  targetSha,
  fetchImpl,
  sleep,
  pollIntervalMs = POLL_INTERVAL_MS,
  maxWaitMs = MAX_WAIT_MS,
}) {
  const deadline = Date.now() + maxWaitMs;
  let lastProblem = 'ни одной попытки';
  while (Date.now() <= deadline) {
    const result = await fetchImpl(url).catch((err) => ({
      status: 0,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    }));
    const problem = targetReachedProblem({
      status: result.status,
      body: result.body,
      targetSha,
    });
    if (problem === null) return { ok: true, problem: null };
    lastProblem = result.error ? `сеть: ${result.error}` : problem;
    await sleep(pollIntervalMs);
  }
  return { ok: false, problem: lastProblem };
}

async function fetchHealth(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function runWait() {
  const url = process.env.PROD_HEALTH_URL?.trim() || 'https://xuanxue.su/api/health';
  const targetSha = process.env.TARGET_SHA?.trim();
  if (!targetSha) {
    console.error('❌ release-wait: TARGET_SHA не задан');
    process.exitCode = 1;
    return;
  }

  console.log(`Ждём ${url} на commit "${targetSha.slice(0, 7)}" (до 15 минут)`);
  const result = await waitForTarget({
    url,
    targetSha,
    fetchImpl: fetchHealth,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });

  if (result.ok) {
    console.log('✓ прод раскатан и отвечает исправно');
    return;
  }
  console.error(`❌ прод не докатился за 15 минут: ${result.problem}`);
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWait().catch((err) => {
    console.error(`❌ release-wait: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
