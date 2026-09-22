#!/usr/bin/env node
// Обёртки над git для гейтов: ни одна функция не бросает — сбой сети, remote
// или самого git даёт { ok: false, error }, не исключение. Про ADR тут не
// знают ничего (правила нумерации — в adr-claims.mjs), так что следующий
// гейт, которому нужны чужие ветки, берёт эти же обёртки.
import { spawnSync } from 'child_process';

const TIMEOUT_MS = 20_000;

/** Один вызов `git <args>` из корня репозитория с таймаутом. */
export function runGit(args, { cwd = process.cwd(), timeoutMs = TIMEOUT_MS } = {}) {
  let r;
  try {
    r = spawnSync('git', args, { cwd, timeout: timeoutMs, encoding: 'utf8' });
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
  if (r.error) return { ok: false, error: String(r.error.message ?? r.error) };
  if (r.signal) return { ok: false, error: `таймаут (сигнал ${r.signal})` };
  if (r.status !== 0) {
    const line = (r.stderr || '').trim().split('\n')[0];
    return { ok: false, error: line || `git ${args[0]}: код ${r.status}` };
  }
  return { ok: true, stdout: r.stdout };
}

/** `for-each-ref refs/remotes/origin` → короткие имена чужих веток, чистая. */
export function parseBranchList(output, { exclude = [] } = {}) {
  const skip = new Set(['HEAD', 'main', ...exclude]);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('origin/'))
    .map((line) => line.slice('origin/'.length))
    .filter((name) => name !== '' && !skip.has(name));
}

/** Объекты всех веток origin без блобов (дёшево); без `--filter` — обычный fetch. */
export function fetchAllBranches(opts = {}) {
  const refspec = '+refs/heads/*:refs/remotes/origin/*';
  const args = ['fetch', 'origin', '--filter=blob:none', '--no-tags', refspec];
  const partial = runGit(args, opts);
  if (partial.ok) return partial;
  return runGit(['fetch', 'origin', '--no-tags', refspec], opts);
}

/** Чужие ветки origin без main и `currentBranch`; нужен fetch до вызова. */
export function listRemoteBranches(currentBranch, opts = {}) {
  const args = ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'];
  const res = runGit(args, opts);
  if (!res.ok) return { ok: false, error: res.error };
  const branches = parseBranchList(res.stdout, { exclude: [currentBranch] });
  return { ok: true, branches };
}

/** Секунды Unix коммита, которым появился `path` в `ref`; null — ещё не в истории. */
export function commitTimeFor(ref, path, opts = {}) {
  const res = runGit(['log', '-1', '--format=%ct', ref, '--', path], opts);
  if (!res.ok) return null;
  const trimmed = res.stdout.trim();
  return trimmed === '' ? null : Number(trimmed);
}
