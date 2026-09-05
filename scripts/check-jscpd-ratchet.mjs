#!/usr/bin/env node
// Храповик копипасты: jscpd считает дублированные строки (≥70 токенов) по
// api/src, web/src, shared/src, счётчик сравнивается с бейслайном. Рост
// роняет CI; снижение — обнови бейслайн:
//   node scripts/check-jscpd-ratchet.mjs --update
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = join(import.meta.dirname, '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'jscpd-baseline.json');
const UPDATE = process.argv.includes('--update');

const out = mkdtempSync(join(tmpdir(), 'jscpd-'));
const res = spawnSync(
  'npx',
  [
    'jscpd',
    'api/src',
    'web/src',
    'shared/src',
    '--min-tokens',
    '70',
    '--reporters',
    'json',
    '--output',
    out,
    '--ignore',
    '**/*.spec.ts,**/*.test.ts,**/*.test.tsx,**/dist/**',
  ],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

let report;
try {
  report = JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8'));
} catch {
  console.error('❌ jscpd не отработал:\n' + (res.stderr || res.stdout).slice(0, 2000));
  process.exit(1);
} finally {
  rmSync(out, { recursive: true, force: true });
}

const lines = report.statistics.total.duplicatedLines;
const clones = report.statistics.total.clones;

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ lines, clones }, null, 2) + '\n');
  console.log(`Бейслайн обновлён: ${lines} дублированных строк, ${clones} клонов.`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(
    'Нет бейслайна — сгенерируй: node scripts/check-jscpd-ratchet.mjs --update',
  );
  process.exit(1);
}

if (lines > baseline.lines) {
  console.error(
    `❌ jscpd-храповик: дублированные строки выросли ${baseline.lines} → ${lines} ` +
      `(клонов ${baseline.clones} → ${clones}).\n` +
      'Новый повторяющийся код выноси в общий модуль/хук (или shared/), а не копируй.\n' +
      'Найти свои клоны: npx jscpd <файлы> --min-tokens 70 --reporters consoleFull\n' +
      'Бейслайн обновляется только вниз: node scripts/check-jscpd-ratchet.mjs --update',
  );
  process.exit(1);
}
console.log(
  lines < baseline.lines
    ? `✓ jscpd-храповик: ${lines} < ${baseline.lines} — стало лучше, зафиксируй: node scripts/check-jscpd-ratchet.mjs --update`
    : `✓ jscpd-храповик: ${lines} (без роста)`,
);
