#!/usr/bin/env node
// Храповик размера файлов (CLAUDE.md: «~150 строк для нового кода, потолок
// 300»). Унаследовано из telegram-bot-2 (там правило без гейта пропустило
// 76+ файлов сверх потолка) — здесь гейт с первого дня.
//
//   1. Файл из бейслайна может только УМЕНЬШАТЬСЯ. Рост роняет CI.
//   2. Новый файл (не в бейслайне) не имеет права родиться больше
//      NEW_FILE_LIMIT=300 строк.
//
// Снизил размер — зафиксируй: node scripts/check-file-size-ratchet.mjs --update
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'file-size-baseline.json');
const UPDATE = process.argv.includes('--update');

const NEW_FILE_LIMIT = 300;

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const EXCLUDE = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)build\//,
  /\.d\.ts$/,
  /\.(spec|test)\.(ts|tsx|js|jsx)$/,
  // Конфиги (eslint, vite, jest) растут вместе с числом правил и порогов —
  // это не логика приложения, ограничивать их размер бессмысленно.
  /(^|\/)[\w.-]*\.config\.(ts|js|mjs|cjs)$/,
];

function listFiles() {
  // --others --exclude-standard: ещё не закоммиченные файлы тоже считаются —
  // иначе новый файл невидим для храповика до первого коммита и не попадает
  // в бейслайн при --update.
  const res = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (res.status !== 0) {
    console.error('❌ git ls-files не отработал:\n' + (res.stderr || ''));
    process.exit(1);
  }
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .filter((p) => CODE_EXT.test(p))
    .filter((p) => !EXCLUDE.some((re) => re.test(p)));
}

function countLines(relPath) {
  try {
    const txt = readFileSync(join(ROOT, relPath), 'utf8');
    if (txt === '') return 0;
    const n = txt.split('\n').length;
    return txt.endsWith('\n') ? n - 1 : n;
  } catch {
    return null;
  }
}

const files = listFiles();
const sizes = {};
for (const f of files) {
  const n = countLines(f);
  if (n !== null) sizes[f] = n;
}

if (UPDATE) {
  const sorted = Object.fromEntries(Object.entries(sizes).sort((a, b) => b[1] - a[1]));
  writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
  const over = Object.values(sizes).filter((n) => n > NEW_FILE_LIMIT).length;
  console.log(
    `Бейслайн обновлён: ${Object.keys(sizes).length} файлов, ` +
      `${over} сверх потолка ${NEW_FILE_LIMIT} (зафиксированы как долг).`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(
    'Нет бейслайна — сгенерируй: node scripts/check-file-size-ratchet.mjs --update',
  );
  process.exit(1);
}

const grown = [];
const newBig = [];
for (const [f, n] of Object.entries(sizes)) {
  if (f in baseline) {
    if (n > baseline[f]) grown.push({ f, was: baseline[f], now: n });
  } else if (n > NEW_FILE_LIMIT) {
    newBig.push({ f, now: n });
  }
}

if (grown.length || newBig.length) {
  if (grown.length) {
    console.error('❌ файл-храповик: файлы выросли сверх зафиксированного размера:');
    for (const { f, was, now } of grown.sort((a, b) => b.now - b.was - (a.now - a.was)))
      console.error(`   ${f}: ${was} → ${now} (+${now - was})`);
    console.error(
      'Раздутый файл дробится (выноси хуки/подкомпоненты/сервисы), а не пухнет дальше.\n' +
        'Если рост неизбежен и осознан — обнови бейслайн:\n' +
        '  node scripts/check-file-size-ratchet.mjs --update',
    );
  }
  if (newBig.length) {
    console.error(
      `❌ файл-храповик: новые файлы больше потолка ${NEW_FILE_LIMIT} строк:`,
    );
    for (const { f, now } of newBig.sort((a, b) => b.now - a.now))
      console.error(`   ${f}: ${now}`);
    console.error(
      `Новый код живёт по правилу с первого дня (~150 строк, потолок ${NEW_FILE_LIMIT}).\n` +
        'Крупный дата-файл — осознанное исключение через --update (видно в диффе PR).',
    );
  }
  process.exit(1);
}

const shrunk = Object.entries(sizes).filter(
  ([f, n]) => f in baseline && n < baseline[f],
).length;
const overCap = Object.values(sizes).filter((n) => n > NEW_FILE_LIMIT).length;
console.log(
  shrunk
    ? `✓ файл-храповик: без роста, ${shrunk} файлов усохло — зафиксируй: ` +
        `node scripts/check-file-size-ratchet.mjs --update (${overCap} ещё сверх ${NEW_FILE_LIMIT})`
    : `✓ файл-храповик: без роста (${overCap} файлов сверх потолка ${NEW_FILE_LIMIT})`,
);
