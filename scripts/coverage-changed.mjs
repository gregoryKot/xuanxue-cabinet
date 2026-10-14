#!/usr/bin/env node
// `npm run coverage:changed` — до пуша проверяет, что СТРОКИ, которые вы
// добавили или изменили в api/src, покрыты unit-тестами. CI считает покрытие api
// только по unit-тестам (check-coverage-ratchet.mjs): код, покрытый одним e2e,
// роняет храповик. Так было дважды (PR #593, #594), и видно это было только в
// CI: полный прогон jest по api локально зависает. Здесь гоняются только
// связанные с изменениями тесты (`--findRelatedTests`), а красным становятся
// лишь изменённые строки — старый непокрытый код в тронутом файле не считается.
//
// Разбор — чистые функции без git/fs/jest (parseDiffHunks, lineHits,
// uncoveredChangedLines, formatRanges, filterCollectable); main() только
// зовёт git и jest. Тесты — coverage-changed.test.mjs.
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from 'path';
import { isMainModule } from './is-main-module.mjs';
import { repoPath } from './repo-path.mjs';
import { packageBinCommand } from './tool-command.mjs';

const ROOT = join(import.meta.dirname, '..');
const API_ROOT = join(ROOT, 'api');
const DEFAULT_BASE = 'origin/main';
const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Строки нового файла из `git diff -U0`: `@@ -a,b +c,d @@` → c..c+d-1 (d по
 * умолчанию 1; d=0 — чистое удаление, добавленных строк нет). */
export function parseDiffHunks(diffText) {
  const byFile = new Map();
  let lines = null;
  let previous = '';
  for (const line of diffText.split('\n')) {
    // Заголовок файла — пара `--- `/`+++ `: одна `+++ …` может оказаться добавленной строкой.
    const isHeader = previous.startsWith('--- ') && line.startsWith('+++ ');
    previous = line;
    if (isHeader) {
      const path = line.slice(4).replace(/\t.*$/, '');
      const file = path.replace(/^b\//, '');
      if (path === '/dev/null') lines = null;
      else lines = byFile.get(file) ?? byFile.set(file, []).get(file);
      continue;
    }
    const hunk = lines && HUNK_RE.exec(line);
    if (!hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let n = start; n < start + count; n++) lines.push(n);
  }
  return byFile;
}

/** Хиты по строкам как в istanbul `getLineCoverage`: строка оператора — его начало,
 * на строке несколько операторов — берём максимум. Строки без операторов
 * (комментарии, типы, пустые) в карту не попадают и не считаются. */
export function lineHits({ statementMap, s }) {
  const hits = new Map();
  for (const [id, { start }] of Object.entries(statementMap)) {
    hits.set(start.line, Math.max(hits.get(start.line) ?? 0, s[id]));
  }
  return hits;
}

/** Изменённые строки с нулём хитов. `changed`: файл → строки; `hitsByFile`: файл →
 * карта из lineHits. Файл без записи покрытия здесь не красит — это ловит main(). */
export function uncoveredChangedLines(changed, hitsByFile) {
  const result = new Map();
  for (const [file, lines] of changed) {
    const hits = hitsByFile.get(file);
    const uncovered = [...new Set(lines)]
      .filter((n) => hits?.get(n) === 0)
      .sort((a, b) => a - b);
    if (uncovered.length > 0) result.set(file, uncovered);
  }
  return result;
}

/** [12, 15, 16, 17, 18] → «12, 15–18». */
export function formatRanges(lines) {
  const parts = [];
  for (let i = 0; i < lines.length;) {
    let j = i;
    while (lines[j + 1] === lines[j] + 1) j++;
    parts.push(j > i ? `${lines[i]}–${lines[j]}` : String(lines[i]));
    i = j + 1;
  }
  return parts.join(', ');
}

// Глобы collectCoverageFrom в jest.config.js — только `**` и `*`.
function globToRegExp(glob) {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/|\*/g, (star) => (star === '*' ? '[^/]*' : '(?:.*/)?'));
  return new RegExp(`^${source}$`);
}

/** Файлы (пути от корня репозитория), которые jest включает в покрытие api по
 * `collectCoverageFrom` (глобы — от api/); остальное считать нечем. */
export function filterCollectable(files, patterns) {
  const include = patterns.filter((p) => !p.startsWith('!')).map(globToRegExp);
  const exclude = patterns
    .filter((p) => p.startsWith('!'))
    .map((p) => globToRegExp(p.slice(1)));
  return files.filter((file) => {
    if (!file.startsWith('api/')) return false;
    const rel = file.slice('api/'.length);
    return include.some((re) => re.test(rel)) && !exclude.some((re) => re.test(rel));
  });
}

function git(args) {
  const res = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0)
    throw new Error(`git ${args.join(' ')}: ${res.stderr || res.error}`);
  return res.stdout;
}

const splitLines = (text) => text.split('\n').filter(Boolean);

function collectChanged(base) {
  const mergeBase = git(['merge-base', base, 'HEAD']).trim();
  // Сравнение с рабочим деревом: незакоммиченные правки тоже считаются.
  const tracked = splitLines(git(['diff', '--name-only', mergeBase]));
  const untracked = splitLines(git(['ls-files', '--others', '--exclude-standard']));
  const patterns = createRequire(import.meta.url)(
    join(API_ROOT, 'jest.config.js'),
  ).collectCoverageFrom;
  const files = filterCollectable(
    [...new Set([...tracked, ...untracked])],
    patterns,
  ).filter((f) => existsSync(join(ROOT, f)));
  const changed = parseDiffHunks(git(['diff', '-U0', mergeBase, '--', ...files]));
  for (const file of files.filter((f) => untracked.includes(f))) {
    const total = readFileSync(join(ROOT, file), 'utf8').split('\n').length;
    changed.set(
      file,
      Array.from({ length: total }, (_, i) => i + 1),
    );
  }
  return { files, changed };
}

function runJest(files, coverageDir) {
  const { command, args } = packageBinCommand(
    'jest',
    [
      '--findRelatedTests',
      ...files.map((f) => join(ROOT, f)),
      '--coverage',
      '--coverageReporters=json',
      `--coverageDirectory=${coverageDir}`,
      ...files.map((f) => `--collectCoverageFrom=${repoPath(API_ROOT, join(ROOT, f))}`),
      '--passWithNoTests',
      '--silent',
    ],
    { cwd: API_ROOT },
  );
  return spawnSync(command, args, { cwd: API_ROOT, stdio: 'inherit' });
}

// Возвращает код выхода, а не зовёт process.exit: `finally` в main() обязан
// успеть удалить временный каталог покрытия.
function report(files, changed, coverageDir) {
  const res = runJest(files, coverageDir);
  if (res.error || res.status !== 0) {
    const why = res.error ? res.error.message : `код ${res.status}`;
    console.error(
      `❌ coverage:changed: jest не отработал (${why}) — сначала почините тесты`,
    );
    return res.status || 1;
  }
  const raw = JSON.parse(readFileSync(join(coverageDir, 'coverage-final.json'), 'utf8'));
  const hitsByFile = new Map(
    Object.entries(raw).map(([abs, cov]) => [repoPath(ROOT, abs), lineHits(cov)]),
  );
  const missing = files.filter((f) => !hitsByFile.has(f));
  if (missing.length > 0) {
    console.error(
      `❌ coverage:changed: jest не отдал покрытие для: ${missing.join(', ')}`,
    );
    return 1;
  }
  const uncovered = uncoveredChangedLines(changed, hitsByFile);
  if (uncovered.size > 0) {
    console.error('❌ coverage:changed: изменённые строки без unit-тестов:');
    for (const [file, lines] of uncovered)
      console.error(`  ${file}: ${formatRanges(lines)}`);
    console.error(
      'Добавьте unit-спек рядом с файлом: CI считает покрытие api только по unit-тестам, ' +
        'e2e храповик не учитывает (check-coverage-ratchet.mjs).',
    );
    return 1;
  }
  const measured = [...changed].reduce(
    (sum, [f, lines]) =>
      sum + new Set(lines.filter((n) => hitsByFile.get(f)?.has(n))).size,
    0,
  );
  console.log(
    `✓ coverage:changed: ${measured} изменённых строк в ${files.length} файлах покрыты unit-тестами`,
  );
  return 0;
}

function main() {
  const baseArg = process.argv.find((a) => a.startsWith('--base='));
  const { files, changed } = collectChanged(
    baseArg ? baseArg.slice('--base='.length) : DEFAULT_BASE,
  );
  if (files.length === 0) {
    console.log('✓ coverage:changed: изменённых файлов api/src нет');
    return;
  }
  const coverageDir = mkdtempSync(join(tmpdir(), 'coverage-changed-'));
  try {
    process.exitCode = report(files, changed, coverageDir);
  } finally {
    rmSync(coverageDir, { recursive: true, force: true });
  }
}

if (isMainModule(import.meta.url)) main();
