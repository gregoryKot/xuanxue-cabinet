#!/usr/bin/env node
// Детектор маркеров конфликта слияния в отслеживаемых файлах (CLAUDE.md,
// правило 1д). Инцидент 2026-09-27: #414 и #418 оба дописали строку в
// оглавление docs/adr/README.md, конфликт разрешили не до конца — и в `main`
// уехали `<<<<<<< HEAD`, `=======` и `>>>>>>> origin/main`. Ни один гейт этого
// не увидел: prettier переформатировал маркеры в строки таблицы и в цитату
// `> > > > > > >`, check-adr-numbers.mjs искал ссылки на файлы решений, а они
// в испорченном оглавлении были целы.
//
// Ловим строку, которая после снятия того, во что markdown-форматтер
// заворачивает маркер (`|` ячейки таблицы, `>` цитаты, пробелы), начинается с
// семи `<` или семи `>` — одних или с пробелом и меткой ветки. `=======` не
// ловим: у markdown это законное подчёркивание заголовка, а без пары
// `<<<<<<<`/`>>>>>>>` конфликта не бывает.
//
// Маркеры в этом файле и в тесте собираются через repeat(), чтобы гейт не
// находил сам себя.
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const OURS = '<'.repeat(7);
const THEIRS = '>'.repeat(7);

/** Что остаётся от строки, если снять обёртки форматтера: ячейку таблицы
 * (`| … |`), цитату (`> `) и пробелы — prettier делает из `>>>>>>> x`
 * вложенную цитату `> > > > > > > x`. */
function unwrap(line) {
  return line.replace(/^[\s|]+/, '').replace(/\s/g, '');
}

function isMarker(line) {
  const bare = unwrap(line);
  return bare.startsWith(OURS) || bare.startsWith(THEIRS);
}

/** Номера строк (с единицы) с маркерами конфликта в тексте. */
export function findConflictMarkers(text) {
  const lines = text.split('\n');
  const found = [];
  lines.forEach((line, index) => {
    if (isMarker(line)) found.push(index + 1);
  });
  return found;
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function main() {
  const ROOT = join(import.meta.dirname, '..');
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

  const paths = res.stdout.split('\n').filter(Boolean);
  const hits = [];
  for (const path of paths) {
    let buffer;
    try {
      buffer = readFileSync(join(ROOT, path));
    } catch {
      // Удалённый, но ещё не закоммиченный файл: git его помнит, диска нет.
      continue;
    }
    if (isBinary(buffer)) continue;
    for (const line of findConflictMarkers(buffer.toString('utf8'))) {
      hits.push(`${path}:${line}`);
    }
  }

  if (hits.length > 0) {
    console.error(`❌ маркеры конфликта слияния:\n   ${hits.join('\n   ')}`);
    console.error(
      'Конфликт разрешён не до конца: оставь нужные строки обеих сторон и убери\n' +
        'маркеры. prettier их не удаляет, а переформатирует — в markdown они\n' +
        'становятся строкой таблицы или цитатой `> > > > > > >`.',
    );
    process.exit(1);
  }
  console.log(`✓ маркеров конфликта нет (${paths.length} файлов)`);
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
