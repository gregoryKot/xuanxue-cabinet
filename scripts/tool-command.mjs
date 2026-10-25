// Как запускать npm и бинари пакетов (jscpd, eslint, jest, vitest) из скриптов без
// shell. На Windows `npx` и `npm` — это `.cmd`: `spawnSync('npx', …)` даёт ENOENT, а
// `shell: true` рвёт путь `C:\Program Files\…` по пробелу. Поэтому всё запускается
// через `process.execPath` с файлом-точкой входа в первом аргументе — одинаково на
// любой ОС и независимо от того, стартовал скрипт через `npm run` или голый `node`
// (инцидент 2026-10-14: ратчеты не запускались на Windows). Гейт —
// `windows-portability.test.mjs`.
import { existsSync, readFileSync } from 'fs';
import { dirname, join, parse, resolve } from 'path';

/** Ищет `node_modules/<pkg>/package.json`, поднимаясь от `cwd` к корню диска: пакет
 * бывает поднят в корневой node_modules воркспейса. `require.resolve` не годится —
 * пакет с `exports` может не отдавать свой package.json. */
function findPackageDir(pkg, cwd) {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, 'node_modules', pkg);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === parse(dir).root) return null;
    dir = dirname(dir);
  }
}

function pickBinPath(pkg, manifest, bin) {
  if (typeof manifest.bin === 'string') return manifest.bin;
  const entries = Object.entries(manifest.bin ?? {});
  const unscoped = pkg.split('/').pop();
  const picked =
    entries.find(([name]) => name === (bin ?? unscoped)) ??
    (bin === undefined && entries.length === 1 ? entries[0] : undefined);
  return picked?.[1];
}

export function packageBinCommand(pkg, args, { cwd, bin } = {}) {
  const dir = findPackageDir(pkg, cwd ?? process.cwd());
  if (!dir)
    throw new Error(
      `пакет ${pkg} не найден в node_modules выше ${cwd}: выполните npm ci`,
    );
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const binPath = pickBinPath(pkg, manifest, bin);
  if (!binPath)
    throw new Error(`у пакета ${pkg} нет исполняемого файла ${bin ?? ''}`.trim());
  return { command: process.execPath, args: [join(dir, binPath), ...args] };
}

/** `npm_execpath` задаёт сам npm при `npm run`; без него — npm-cli.js рядом с node
 * (стандартная установка Windows); и только потом голое `npm`. */
export function npmCommand(args, env = process.env, nodeDir = dirname(process.execPath)) {
  if (env.npm_execpath) {
    return { command: process.execPath, args: [env.npm_execpath, ...args] };
  }
  const bundled = join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(bundled)) return { command: process.execPath, args: [bundled, ...args] };
  return { command: 'npm', args };
}
