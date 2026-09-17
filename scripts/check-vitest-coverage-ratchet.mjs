#!/usr/bin/env node
// coverage-храповик для vitest-пакетов (web, shared) — по образцу
// check-coverage-ratchet.mjs (api). Раньше порог web жил в
// `web/vite.config.ts` как `thresholds.autoUpdate: true`: рост покрытия
// заставлял vitest переписывать конфиг и срезать финальный перевод строки,
// `prettier --check` падал, `npm run check` оставлял грязное дерево, а в CI
// правка выбрасывалась вместе с раннером — порог замораживался (аудит
// docs/audits/2026-09-12-quality-audit.md, находка H2). У `shared` порога не
// было вовсе (там же, находка M5). Этот скрипт не трогает конфиг: бейслайн —
// отдельный JSON, поднимается только явным `--update`.
//
// Запускает vitest сам (с --coverage) в каталоге воркспейса — отдельный
// `npx vitest` в CI не нужен, этот скрипт его заменяет.
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'vitest-coverage-baseline.json');
const UPDATE = process.argv.includes('--update');
const WORKSPACE = process.argv[2];

const EPSILON = 0.1;
const METRICS = ['lines', 'branches', 'functions', 'statements'];
const KNOWN_WORKSPACES = ['web', 'shared'];

if (!KNOWN_WORKSPACES.includes(WORKSPACE)) {
  console.error(
    `❌ укажи воркспейс первым аргументом: node scripts/check-vitest-coverage-ratchet.mjs <${KNOWN_WORKSPACES.join('|')}> [--update]`,
  );
  process.exit(1);
}

const WORKSPACE_ROOT = join(ROOT, WORKSPACE);
const SUMMARY_PATH = join(WORKSPACE_ROOT, 'coverage', 'coverage-summary.json');

const res = spawnSync(
  'npx',
  ['vitest', 'run', '--coverage', '--coverage.reporter=json-summary'],
  {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  },
);
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);

if (res.error) {
  console.error('❌ не удалось запустить vitest: ' + res.error.message);
  process.exit(1);
}
if (res.status !== 0) {
  // status/signal в логе: иначе SIGKILL по памяти не отличить от упавшего теста.
  console.error(`❌ vitest упал: status=${res.status} signal=${res.signal}`);
  process.exit(res.status ?? 1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
} catch {
  console.error(
    `❌ не найден ${SUMMARY_PATH} — vitest не сгенерировал coverage-summary.json.`,
  );
  process.exit(1);
}

const current = Object.fromEntries(METRICS.map((m) => [m, summary.total[m].pct]));

if (UPDATE) {
  const existing = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  existing[WORKSPACE] = current;
  writeFileSync(BASELINE_PATH, JSON.stringify(existing, null, 2) + '\n');
  console.log(
    `Бейслайн ${WORKSPACE} обновлён: ` +
      METRICS.map((m) => `${m} ${current[m]}%`).join(', ') +
      '.',
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))[WORKSPACE];
} catch {
  baseline = undefined;
}
if (!baseline) {
  console.error(
    `Нет бейслайна для "${WORKSPACE}" — сгенерируй: node scripts/check-vitest-coverage-ratchet.mjs ${WORKSPACE} --update`,
  );
  process.exit(1);
}

const failures = [];
for (const m of METRICS) {
  if (baseline[m] - current[m] > EPSILON) {
    failures.push(`${m}: ${baseline[m]}% → ${current[m]}%`);
  }
}

if (failures.length > 0) {
  console.error(`❌ coverage-храповик: покрытие ${WORKSPACE} просело.`);
  for (const f of failures) console.error(`   ${f}`);
  console.error(
    'Правило CLAUDE.md «Тесты»: новый код приезжает с тестами — покрытие не должно падать.\n' +
      `Если снижение осознанное — обнови бейслайн: node scripts/check-vitest-coverage-ratchet.mjs ${WORKSPACE} --update`,
  );
  process.exit(1);
}

const grew = METRICS.some((m) => current[m] - baseline[m] > EPSILON);
if (grew) {
  console.log(
    `✓ coverage-храповик ${WORKSPACE}: ` +
      METRICS.map((m) => `${m} ${current[m]}% (было ${baseline[m]}%)`).join(', ') +
      ' — стало лучше, зафиксируй прогресс: ' +
      `node scripts/check-vitest-coverage-ratchet.mjs ${WORKSPACE} --update`,
  );
} else {
  console.log(
    `✓ coverage-храповик ${WORKSPACE}: ` +
      METRICS.map((m) => `${m} ${current[m]}%`).join(', ') +
      ' — без просадки.',
  );
}
