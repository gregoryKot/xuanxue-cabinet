#!/usr/bin/env node
// Гейт мёртвых экспортов `shared/src/index.ts` (аудит 2026-09-12, находка M8).
//
// Почему свой скрипт, а не knip: `api` и `web` импортируют пакет
// `@xuanxue/shared`, который резолвится в `shared/dist` через симлинк
// воркспейса, а не в исходники. Для knip это внешний пакет: он не связывает
// имя из `dist/index.js` с экспортом в `shared/src/*.ts`, поэтому
// `includeEntryExports: true` объявляет мёртвыми все 156 экспортов барабана, а
// без него — ни одного (проверено на обеих настройках, плюс на маппинге
// `paths`). Знание «кто кого использует» живёт здесь.
//
// Использованием считается только ИМПОРТ имени: в `api/src` и `web/src` — из
// `@xuanxue/shared`, внутри `shared/src` — из соседнего модуля. Не просто
// «встречается в тексте»: константа, которую читает лишь её собственный файл
// (так жил `MUTATING_METHODS` — рядом с `isMutatingMethod`), наружу не нужна,
// а поиск по вхождению засчитал бы её как живую.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const BARREL = join(ROOT, 'shared', 'src', 'index.ts');
const CONSUMER_DIRS = [
  join(ROOT, 'api', 'src'),
  join(ROOT, 'web', 'src'),
  join(ROOT, 'shared', 'src'),
];
const SOURCE_RE = /\.(ts|tsx)$/;

/** Имена из `export { A, B as C } from './x'` и `export type { … }` — без
 * блоков объявлений (`export const x =`), их в барабане нет по правилу
 * CLAUDE.md «Дубли и мёртвый код». */
function barrelExports(source) {
  const names = [];
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const part of match[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop();
      if (name) names.push(name.trim());
    }
  }
  return [...new Set(names)];
}

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (SOURCE_RE.test(entry)) files.push(path);
  }
  return files;
}

const names = barrelExports(readFileSync(BARREL, 'utf8'));
if (names.length === 0) {
  console.error('❌ не удалось разобрать экспорты shared/src/index.ts');
  process.exit(1);
}

/** Имена из всех `import { … } from '…'` файла — с `type`-модификаторами и
 * переименованиями (`import { A as B }` засчитывает `A`). */
function importedNames(source) {
  const names = [];
  for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const part of match[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (name) names.push(name.trim());
    }
  }
  return names;
}

const used = new Set();
for (const dir of CONSUMER_DIRS) {
  for (const file of sourceFiles(dir)) {
    if (file === BARREL) continue;
    for (const name of importedNames(readFileSync(file, 'utf8'))) used.add(name);
  }
}

const dead = names.filter((name) => !used.has(name));
if (dead.length > 0) {
  console.error('❌ мёртвые экспорты shared/src/index.ts (никто не использует):');
  for (const name of dead) console.error(`   ${name}`);
  console.error(
    'Правило CLAUDE.md «Дубли и мёртвый код»: убери из барабана — внутри shared\n' +
      'имя можно оставить, если его использует сам пакет.',
  );
  process.exit(1);
}

console.log(`✓ экспорты shared: ${names.length} — все используются`);
