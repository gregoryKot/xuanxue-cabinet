#!/usr/bin/env node
// coverage-храповик для web/ (по образцу check-coverage-ratchet.mjs для api).
// Раньше порог жил в web/vite.config.ts (thresholds.autoUpdate: true) —
// vitest сам переписывал файл при росте покрытия, без финального перевода
// строки, и `npm run check` падал на `prettier --check` на чистом дереве
// (docs/audits/2026-09-12-quality-audit.md, находка H2). Теперь порога в
// vite.config.ts нет вообще — только внешний бейслайн, который трогает
// исключительно этот скрипт и только с флагом --update.
//
// Запускает vitest сам (с --coverage) в web/ — отдельный прогон в CI/`check`
// не нужен, этот скрипт его заменяет. Общая логика с api-храповиком —
// scripts/coverage-ratchet-lib.mjs.
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  runTestsWithCoverage,
  loadSummary,
  loadBaseline,
  checkMetricsRatchet,
} from './coverage-ratchet-lib.mjs';

const ROOT = join(import.meta.dirname, '..');
const WEB_ROOT = join(ROOT, 'web');
const BASELINE_PATH = join(ROOT, 'scripts', 'web-coverage-baseline.json');
const SUMMARY_PATH = join(WEB_ROOT, 'coverage', 'coverage-summary.json');
const UPDATE = process.argv.includes('--update');
const UPDATE_COMMAND = 'node scripts/check-web-coverage-ratchet.mjs --update';

const METRICS = ['lines', 'branches', 'functions', 'statements'];

runTestsWithCoverage('npx', ['vitest', 'run', '--coverage'], { cwd: WEB_ROOT });

const summary = loadSummary(SUMMARY_PATH);

const current = Object.fromEntries(
  METRICS.map((name) => [name, summary.total[name].pct]),
);

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
  console.log(
    `Бейслайн обновлён: ${METRICS.map((name) => `${name} ${current[name]}%`).join(', ')}.`,
  );
  process.exit(0);
}

const baseline = loadBaseline(BASELINE_PATH, UPDATE_COMMAND);

checkMetricsRatchet({
  metricNames: METRICS,
  current,
  baseline,
  label: 'coverage-храповик web',
  updateCommand: UPDATE_COMMAND,
});
