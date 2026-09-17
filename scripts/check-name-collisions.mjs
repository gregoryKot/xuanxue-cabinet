#!/usr/bin/env node
// Детектор имён, различающихся только регистром (CLAUDE.md, раздел
// «Именование»). Инцидент 2026-09-16: в web/src/exams/ жили компонент
// `ExamQuestionList.tsx` и хелпер `examQuestionList.ts`. На macOS (регистр в
// имени файла не значим, `.ts` резолвится раньше `.tsx`) импорт
// `./ExamQuestionList` уводил в хелпер: tsc, eslint и 38 тестов падали
// локально, а Linux-CI оставался зелёным и поломки не показывал.
//
// Ловим два вида коллизий в одном каталоге:
//   1. имена файлов совпадают без учёта регистра — такой репозиторий на
//      case-insensitive файловой системе просто не выкладывается целиком;
//   2. имена модулей (имя без расширения) совпадают без учёта регистра —
//      резолвер импорта выбирает один из них, и не обязательно тот, что
//      написан в коде.
//
// Разбор — чистая функция findNameCollisions(paths) без обращения к fs:
// check-name-collisions.test.mjs гоняет её на списках-фикстурах, а не на
// сегодняшнем дереве репозитория.
import { spawnSync } from 'child_process';
import { join } from 'path';

// Расширения, которые резолвер импорта подставляет сам: `./x` может оказаться
// x.ts, x.tsx, x.js… — поэтому конфликтуют имена без расширения.
const MODULE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function splitPath(path) {
  const slash = path.lastIndexOf('/');
  return { dir: slash === -1 ? '' : path.slice(0, slash), name: path.slice(slash + 1) };
}

/** Имя модуля для файла: расширение отбрасывается только у кода. У прочих
 * файлов модуля нет — `logo.svg` и `Logo.png` друг другу не мешают, их
 * импортируют с расширением. */
function moduleName(name) {
  const ext = MODULE_EXT.find((e) => name.endsWith(e));
  return ext === undefined ? null : name.slice(0, -ext.length);
}

function groupBy(paths, keyOf) {
  const groups = new Map();
  for (const path of paths) {
    const key = keyOf(path);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(path);
    else groups.set(key, [path]);
  }
  return groups;
}

function spellings(paths, nameOf) {
  return new Set(paths.map((p) => nameOf(splitPath(p).name)));
}

/** Группы путей, конфликтующих по регистру: `kind: 'file'` — совпало имя
 * файла целиком, `kind: 'module'` — совпало имя без расширения. Ключ группы
 * включает каталог: одинаковые имена в разных каталогах резолверу не мешают. */
export function findNameCollisions(paths) {
  const collisions = [];

  const byFile = groupBy(paths, (p) => {
    const { dir, name } = splitPath(p);
    return `${dir}/${name.toLowerCase()}`;
  });
  for (const files of byFile.values()) {
    if (spellings(files, (n) => n).size > 1) collisions.push({ kind: 'file', files });
  }

  const byModule = groupBy(paths, (p) => {
    const { dir, name } = splitPath(p);
    const mod = moduleName(name);
    return mod === null ? null : `${dir}/${mod.toLowerCase()}`;
  });
  for (const files of byModule.values()) {
    // Одно и то же написание (`foo.ts` и `foo.js`) — не коллизия регистра.
    if (spellings(files, moduleName).size === 1) continue;
    // Совпавшие целиком имена файлов уже названы выше — не повторяем.
    if (spellings(files, (n) => n.toLowerCase()).size === 1) continue;
    collisions.push({ kind: 'module', files });
  }

  return collisions.sort((a, b) => a.files[0].localeCompare(b.files[0]));
}

function main() {
  const ROOT = join(import.meta.dirname, '..');
  const res = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    console.error('❌ git ls-files не отработал:\n' + (res.stderr || ''));
    process.exit(1);
  }

  const paths = res.stdout.split('\n').filter(Boolean);
  const collisions = findNameCollisions(paths);

  if (collisions.length > 0) {
    for (const { kind, files } of collisions) {
      const what =
        kind === 'file'
          ? 'имена файлов различаются только регистром'
          : 'имена модулей различаются только регистром — импорт уведёт не туда';
      console.error(`❌ ${what}:\n   ${files.join('\n   ')}`);
    }
    console.error(
      'На macOS регистр в имени не значим, и `./Имя` резолвится в первый подходящий\n' +
        'файл: у разработчика падают tsc, eslint и тесты, а Linux-CI остаётся зелёным.\n' +
        'Дай файлам имена, различающиеся не только регистром.',
    );
    process.exit(1);
  }
  console.log(`✓ коллизий имён по регистру нет (${paths.length} файлов)`);
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
