#!/usr/bin/env node
// coverage-храповик для api/ (по образцу check-eslint-ratchet.mjs). Правило
// CLAUDE.md «Тесты»: новый код с логикой приезжает с тестом — этот скрипт
// следит, чтобы суммарное покрытие (lines/branches) api не падало, и держит
// жёсткий пол на критичных зонах (напр. api/src/utils — шифрование).
//
// Запускает jest сам (с --coverage) в api/ — отдельный `npx jest` в CI не
// нужен, этот скрипт его заменяет. Общая логика с web-храповиком —
// scripts/coverage-ratchet-lib.mjs.
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  runTestsWithCoverage,
  loadSummary,
  loadBaseline,
  checkMetricsRatchet,
} from './coverage-ratchet-lib.mjs';

const ROOT = join(import.meta.dirname, '..');
const API_ROOT = join(ROOT, 'api');
const BASELINE_PATH = join(ROOT, 'scripts', 'coverage-baseline.json');
const SUMMARY_PATH = join(API_ROOT, 'coverage', 'coverage-summary.json');
const UPDATE = process.argv.includes('--update');
const UPDATE_COMMAND = 'node scripts/check-coverage-ratchet.mjs --update';

// Дефолтная критичная зона для жёсткого пола — используется только при
// первом --update, когда бейслайна ещё нет. Дальше список зон живёт в самом
// бейслайне (scripts/coverage-baseline.json → floors).
const DEFAULT_FLOOR_DIRS = ['src/utils'];

const jestArgs = ['jest', '--coverage', '--silent', '--coverageReporters=json-summary'];
if (process.env.JEST_CACHE_DIR) {
  jestArgs.push(`--cacheDirectory=${process.env.JEST_CACHE_DIR}`);
}
runTestsWithCoverage('npx', jestArgs, { cwd: API_ROOT });

const summary = loadSummary(SUMMARY_PATH);

function relPath(absPath) {
  return absPath.startsWith(API_ROOT + '/')
    ? absPath.slice(API_ROOT.length + 1)
    : absPath;
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
      console.error(
        `❌ --update: под "${dir}" не найдено ни одного файла в coverage-summary.json.`,
      );
      process.exit(1);
    }
    floors[dir] = Math.max(0, Math.round((pct - 2) * 100) / 100);
  }
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      { lines: current.lines, branches: current.branches, floors },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Бейслайн обновлён: lines ${current.lines}%, branches ${current.branches}%, ` +
      `floors ${JSON.stringify(floors)}.`,
  );
  process.exit(0);
}

const baseline = loadBaseline(BASELINE_PATH, UPDATE_COMMAND);

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

checkMetricsRatchet({
  metricNames: ['lines', 'branches'],
  current,
  baseline,
  label: 'coverage-храповик api',
  updateCommand: UPDATE_COMMAND,
  extraFailureLines: floorFailures,
  extraOkSuffix: ` (пол ${JSON.stringify(baseline.floors ?? {})})`,
});
