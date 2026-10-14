// Гейт переносимости скриптов на Windows. Инцидент 2026-10-14: гейты писались под
// Linux CI, а разработчик гоняет их локально перед PR — на Windows `relative()` отдаёт
// `web\src\x.ts` (бейслайн с `/` не находит файл, гейт краснеет на каждой строке), а
// `spawnSync('npx', …)` даёт ENOENT (ратчеты вообще не запускались).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SCRIPTS_DIR = import.meta.dirname;
// Сами помощники и этот тест: в них запрещённые обороты называются по имени.
const EXEMPT = new Set([
  'repo-path.mjs',
  'tool-command.mjs',
  'windows-portability.test.mjs',
]);

// Строки собраны из частей, иначе тест нашёл бы сам себя.
const REPO_PATH_HINT = 'repoPath(ROOT, file) из ./repo-path.mjs';
const SPAWN_HINT = 'packageBinCommand / npmCommand из ./tool-command.mjs';
const FORBIDDEN = [
  { pattern: ['relative', '(ROOT'].join(''), hint: REPO_PATH_HINT },
  ...['spawnSync', 'execFileSync'].flatMap((fn) =>
    ['npx', 'npm'].flatMap((bin) =>
      ["'", '"'].map((quote) => ({
        pattern: `${fn}(${quote}${bin}${quote}`,
        hint: SPAWN_HINT,
      })),
    ),
  ),
];

function findOffenders() {
  const offenders = [];
  for (const name of readdirSync(SCRIPTS_DIR)) {
    if (!name.endsWith('.mjs') || EXEMPT.has(name)) continue;
    const source = readFileSync(join(SCRIPTS_DIR, name), 'utf8');
    for (const { pattern, hint } of FORBIDDEN) {
      if (source.includes(pattern)) offenders.push(`${name}: «${pattern}» → ${hint}`);
    }
  }
  return offenders;
}

test('гейт: в scripts/*.mjs нет оборотов, ломающихся на Windows', () => {
  assert.deepEqual(
    findOffenders(),
    [],
    'Метка файла — repoPath из ./repo-path.mjs (на Windows relative даёт `\\`, ' +
      'а бейслайны с `/`); npm и бинари пакетов (npx, jest, eslint, …) запускаются через ' +
      'packageBinCommand / npmCommand из ./tool-command.mjs, а не по имени: без shell ' +
      '`npx` и `npm` на Windows дают ENOENT.',
  );
});
