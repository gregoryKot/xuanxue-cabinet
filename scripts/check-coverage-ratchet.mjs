#!/usr/bin/env node
// coverage-храповик для api/ (по образцу check-eslint-ratchet.mjs). Правило
// CLAUDE.md «Тесты»: новый код с логикой приезжает с тестом — этот скрипт
// следит, чтобы суммарное покрытие (lines/branches) api не падало, и держит
// жёсткий пол на критичных зонах (напр. api/src/utils — шифрование).
//
// Запускает jest сам (с --coverage) в api/ — отдельный `npx jest` в CI не
// нужен, этот скрипт его заменяет.
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const API_ROOT = join(ROOT, 'api');
const BASELINE_PATH = join(ROOT, 'scripts', 'coverage-baseline.json');
const SUMMARY_PATH = join(API_ROOT, 'coverage', 'coverage-summary.json');
const UPDATE = process.argv.includes('--update');

const EPSILON = 0.1;
// Дефолтная критичная зона для жёсткого пола — используется только при
// первом --update, когда бейслайна ещё нет. Дальше список зон живёт в самом
// бейслайне (scripts/coverage-baseline.json → floors).
const DEFAULT_FLOOR_DIRS = ['src/utils'];

const jestArgs = ['jest', '--coverage', '--silent', '--coverageReporters=json-summary'];
if (process.env.JEST_CACHE_DIR) {
  jestArgs.push(`--cacheDirectory=${process.env.JEST_CACHE_DIR}`);
}
const res = spawnSync('npx', jestArgs, {
  cwd: API_ROOT,
  encoding: 'utf8',
  maxBuffer: 512 * 1024 * 1024,
});
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);

if (res.error) {
  console.error('❌ не удалось запустить jest: ' + res.error.message);
  process.exit(1);
}
if (res.status !== 0) {
  console.error(
    '❌ jest завершился с ошибкой (упавшие тесты?) — coverage-храповик не проверяется.',
  );
  process.exit(res.status ?? 1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
} catch {
  console.error(`❌ не найден ${SUMMARY_PATH} — jest не сгенерировал coverage-summary.json.`);
  process.exit(1);
}

function relPath(absPath) {
  return absPath.startsWith(API_ROOT + '/') ? absPath.slice(API_ROOT.length + 1) : absPath;
}

function dirLinesPct(prefix) {
  const withSlash = prefix.endsWith('/') ? prefix : prefix + '/';
  let total = 0;
  let covered = 0;
  for (const [absPath, entry] of Object.entries(summary)) {
    if (absPath === 'total') continue;
    if (relPath(absPath).startsWith(withSlash)) {
      total += entry.lines.total;
      covered += entry.lines.covered;
    }
  }
  return total > 0 ? (covered / total) * 100 : null;
}

const current = {
  lines: summary.total.lines.pct,
  branches: summary.total.branches.pct,
};

if (UPDATE) {
  const existing = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : null;
  const floorDirs = existing?.floors ? Object.keys(existing.floors) : DEFAULT_FLOOR_DIRS;
  const floors = {};
  for (const dir of floorDirs) {
    const pct = dirLinesPct(dir);
    if (pct === null) {
      console.error(`❌ --update: под "${dir}" не найдено ни одного файла в coverage-summary.json.`);
      process.exit(1);
    }
    floors[dir] = Math.max(0, Math.round((pct - 2) * 100) / 100);
  }
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ lines: current.lines, branches: current.branches, floors }, null, 2) + '\n',
  );
  console.log(
    `Бейслайн обновлён: lines ${current.lines}%, branches ${current.branches}%, ` +
      `floors ${JSON.stringify(floors)}.`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error('Нет бейслайна — сгенерируй: node scripts/check-coverage-ratchet.mjs --update');
  process.exit(1);
}

const failures = [];
if (baseline.lines - current.lines > EPSILON) {
  failures.push(`lines: ${baseline.lines}% → ${current.lines}%`);
}
if (baseline.branches - current.branches > EPSILON) {
  failures.push(`branches: ${baseline.branches}% → ${current.branches}%`);
}

const floorFailures = [];
for (const [dir, floor] of Object.entries(baseline.floors ?? {})) {
  const pct = dirLinesPct(dir);
  if (pct === null) {
    floorFailures.push(`${dir}: файлов не найдено (директория удалена/переименована?)`);
    continue;
  }
  if (pct < floor - 0.001) {
    floorFailures.push(`${dir}: ${pct.toFixed(2)}% < пола ${floor}%`);
  }
}

if (failures.length > 0 || floorFailures.length > 0) {
  console.error('❌ coverage-храповик: покрытие api просело.');
  if (failures.length > 0) {
    console.error('Общий бейслайн:');
    for (const f of failures) console.error(`   ${f}`);
  }
  if (floorFailures.length > 0) {
    console.error('Жёсткий пол по директориям:');
    for (const f of floorFailures) console.error(`   ${f}`);
  }
  console.error(
    'Правило CLAUDE.md «Тесты»: новый код приезжает с тестами — покрытие не должно падать.\n' +
      'Если снижение осознанное — обнови бейслайн: node scripts/check-coverage-ratchet.mjs --update',
  );
  process.exit(1);
}

if (current.lines - baseline.lines > EPSILON || current.branches - baseline.branches > EPSILON) {
  console.log(
    `✓ coverage-храповик: lines ${current.lines}% (было ${baseline.lines}%), ` +
      `branches ${current.branches}% (было ${baseline.branches}%) — стало лучше, ` +
      'зафиксируй прогресс: node scripts/check-coverage-ratchet.mjs --update',
  );
} else {
  console.log(
    `✓ coverage-храповик: lines ${current.lines}% (пол ${JSON.stringify(baseline.floors ?? {})}), ` +
      `branches ${current.branches}% (без просадки)`,
  );
}
