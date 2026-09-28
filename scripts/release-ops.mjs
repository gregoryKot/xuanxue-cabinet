#!/usr/bin/env node
// Мелкие CLI-обёртки над чистым ядром release-candidate.mjs для
// .github/workflows/release.yml: тег, цель отката, текст уведомления.
// Вынесены отдельно, чтобы workflow не тащил встроенный JS внутрь YAML
// (нечитаемо и не тестируется) — вся логика здесь дальше одной строки glue
// поверх уже протестированных pickCandidate/previousReleaseTag/summaryMessage.
import { spawnSync } from 'node:child_process';
import {
  releaseTagName,
  previousReleaseTag,
  summaryMessage,
} from './release-candidate.mjs';

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

/** `node release-candidate.mjs tag-name [суффикс]` → `prod-YYYYMMDD-HHMM[суффикс]`.
 * Суффикс — третий argv (`node <файл> tag-name <суффикс>`), независимо от
 * того, какой файл фактически выполняет команду (дальше по цепочке
 * динамического импорта argv не меняется). */
export function runTagName() {
  const suffix = process.argv[3] ?? '';
  console.log(releaseTagName(Math.floor(Date.now() / 1000)) + suffix);
}

/** `node release-ops.mjs rollback-target` — печатает `sha=...` (и `tag=...`,
 * если цель найдена по тегу). `ROLLBACK_SHA` — явная цель (input workflow_dispatch),
 * иначе берём предыдущий `prod-*` тег. Не находим цель — ошибка и exit 1:
 * откат без цели заведомо ломает прод, лучше остановиться явно. */
export function runRollbackTarget() {
  const explicit = process.env.ROLLBACK_SHA?.trim();
  if (explicit) {
    const full = runGit(['rev-parse', explicit]);
    if (!full) {
      console.error(`❌ release-ops: "${explicit}" не резолвится в коммит`);
      process.exitCode = 1;
      return;
    }
    console.log(`sha=${full}`);
    return;
  }

  const tagList = runGit([
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/tags/prod-*',
  ]);
  const names = tagList ? tagList.split('\n').filter(Boolean) : [];
  const tags = names
    .map((name) => ({ name, sha: runGit(['rev-parse', name]) }))
    .filter((t) => t.sha);
  const prev = previousReleaseTag(tags);
  if (!prev) {
    console.error(
      '❌ release-ops: нет предыдущего prod-тега для отката — укажи sha вручную',
    );
    process.exitCode = 1;
    return;
  }
  const sha = runGit(['rev-parse', prev]);
  console.log(`sha=${sha}`);
  console.log(`tag=${prev}`);
}

/** `node release-ops.mjs summary` — читает subject-строки из stdin (по одной
 * на строку), `MODE`/`SHA`/`TAG` — из env; печатает текст для Telegram. */
export async function runSummary() {
  const subjectLines = (await readStdin()).split('\n').filter(Boolean);
  console.log(
    summaryMessage({
      mode: process.env.MODE,
      sha: process.env.SHA,
      subjectLines,
      tag: process.env.TAG,
    }),
  );
}

async function main() {
  const [, , subcommand] = process.argv;
  if (subcommand === 'tag-name') return runTagName();
  if (subcommand === 'rollback-target') return runRollbackTarget();
  if (subcommand === 'summary') return runSummary();
  console.error(
    'Использование: node scripts/release-ops.mjs tag-name|rollback-target|summary',
  );
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`❌ release-ops: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
