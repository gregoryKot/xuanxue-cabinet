#!/usr/bin/env node
// Гейты барабана `shared/src/index.ts` (аудит 2026-09-12, M8; CLAUDE.md,
// «Дубли и мёртвый код»): 1) barrelViolations — барабан не содержит ничего,
// кроме комментариев и `export … from` (подробности и «почему» — у функции);
// 2) barrelExports — среди этих реэкспортов нет мёртвых. Проверка 1 раньше
// проверки 2: необнаруженное ею объявление невидимо и гейту мёртвых тоже.
// Свой скрипт для проверки 2, а не knip: `@xuanxue/shared` резолвится в
// `shared/dist` через симлинк воркспейса, а не в исходники — knip либо метит
// мёртвыми все экспорты барабана, либо ни одного. Использование — ИМПОРТ
// имени (из `@xuanxue/shared` в api/web, из соседнего модуля внутри shared),
// не просто «встречается в тексте»: так жил `MUTATING_METHODS`, который
// читает только его собственный файл.
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
export function barrelExports(source) {
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

/** Нарушения контракта барабана: только комментарии и `export … from '…'`.
 * Снимаем комментарии (закомментированное объявление — не нарушение), режем
 * разрешённое (`export {…} from`/`export type {…} from`, в т.ч. многострочно)
 * — то непустое, что осталось, и есть нарушение. `export * from` — тоже
 * нарушение, но с признаком `star`: `barrelExports` не видит имён через `*`,
 * они молча уходят из-под гейта мёртвых экспортов. */
export function barrelViolations(source) {
  const violations = [];
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const withoutStar = withoutComments.replace(
    /export\s*\*\s*from\s*['"][^'"]*['"]\s*;?/g,
    (match) => {
      violations.push({ text: match.trim(), star: true });
      return '';
    },
  );
  const rest = withoutStar.replace(
    /export\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?/g,
    '',
  );
  for (const line of rest.split('\n')) {
    if (line.trim()) violations.push({ text: line.trim(), star: false });
  }
  return violations;
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

function main() {
  const barrel = readFileSync(BARREL, 'utf8');

  const violations = barrelViolations(barrel);
  if (violations.length > 0) {
    console.error('❌ shared/src/index.ts — не только реэкспорты:');
    for (const { text, star } of violations) {
      const suffix = star ? ' (export * — имена не видны barrelExports)' : '';
      console.error(`   ${text}${suffix}`);
    }
    console.error(
      'Объявление в барабане невидимо для гейта мёртвых экспортов, исключено из\n' +
        'покрытия (shared/vitest.config.ts) и не считается check-file-size-ratchet —\n' +
        'три слепые зоны разом. Вынеси в shared/src/<домен>.ts и реэкспортируй оттуда.',
    );
    process.exit(1);
  }

  const names = barrelExports(barrel);
  if (names.length === 0) {
    console.error('❌ не удалось разобрать экспорты shared/src/index.ts');
    process.exit(1);
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
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
