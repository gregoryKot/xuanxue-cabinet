#!/usr/bin/env node
// Проверка нумерации ADR: один номер — одно решение, каждое решение видно в
// оглавлении, каждая ссылка на файл решения куда-то ведёт.
//
// Все три инварианта уже ломались разом. 2026-09-20 номер 0059 заняли два
// файла сразу (#242 и #250), второй при этом не попал в docs/adr/README.md
// вовсе — ссылка «ADR-0059» перестала говорить, про вход она или про теги
// занятия. Прожило это сутки и чинилось перенумерацией через полрепозитория
// (#273), по дороге собрав ещё и битую ссылку в шапке ADR-0072 на файл,
// которого уже не было.
//
// Почему хватает чтения каталога, без обращения к GitHub: CI на pull_request
// собирает дерево уже слитым с базовой веткой, поэтому файл ветки и
// одноимённый файл main лежат рядом — дубль виден обычным readdir. Номер,
// занятый в чужом ещё не слитом PR, здесь не ловится намеренно: красный CI
// из-за чужой ветки не говорит автору ничего про его собственный дифф.
//
// Разбор вынесен в чистые функции без fs — check-adr-numbers.test.mjs гоняет
// их на фикстурах-строках, а не на сегодняшнем состоянии docs/adr.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/** `0075-lesson-tags-and-tag-screen.md` → `{ number, slug }`. Не то имя —
 * null: заглавные буквы и пробелы ломают ссылки на macOS и в вебе. */
export function parseAdrFileName(name) {
  const m = /^(\d{4})-([a-z0-9-]+)\.md$/.exec(name);
  return m ? { number: m[1], slug: m[2] } : null;
}

/** {номер: [файлы]} только для номеров, занятых больше одного раза. */
export function findDuplicateNumbers(adrs) {
  const byNumber = {};
  for (const { number, file } of adrs) (byNumber[number] ??= []).push(file);
  const duplicates = {};
  for (const [number, files] of Object.entries(byNumber)) {
    if (files.length > 1) duplicates[number] = [...files].sort();
  }
  return duplicates;
}

/** Номер из заголовка `# NNNN. …` первой непустой строки; null — заголовка
 * такого вида нет. Переименовали файл, забыли заголовок — ловится здесь. */
export function headingNumber(src) {
  const first = src.split('\n').find((line) => line.trim() !== '') ?? '';
  const m = /^#\s*(\d{4})\./.exec(first.trim());
  return m ? m[1] : null;
}

/** Строки таблицы оглавления: `| [NNNN](файл.md) | …` → `{ number, target }`. */
export function parseIndexRows(src) {
  return [...src.matchAll(/^\|\s*\[(\d{4})\]\(([^)]+)\)/gm)].map((m) => ({
    number: m[1],
    target: m[2],
  }));
}

/** Относительные ссылки вида `](NNNN-slug.md)`, ведущие в никуда: после
 * переименования такая ссылка молча отдаёт 404 вместо решения. */
export function findDeadLinks(src, existingFiles) {
  const existing = new Set(existingFiles);
  return [...src.matchAll(/\]\((?:\.\/)?(\d{4}-[a-z0-9-]+\.md)\)/g)]
    .map((m) => m[1])
    .filter((target) => !existing.has(target));
}

function main() {
  const ADR_DIR = join(import.meta.dirname, '..', 'docs', 'adr');
  const names = readdirSync(ADR_DIR).filter(
    (n) => n !== 'README.md' && n.endsWith('.md'),
  );

  const problems = [];
  const adrs = [];
  for (const file of names.sort()) {
    const parsed = parseAdrFileName(file);
    if (!parsed) {
      problems.push(`имя не по схеме NNNN-короткое-название.md: docs/adr/${file}`);
      continue;
    }
    adrs.push({ ...parsed, file });
  }

  for (const [number, files] of Object.entries(findDuplicateNumbers(adrs))) {
    problems.push(
      `номер ${number} занят дважды:\n   ${files.map((f) => `docs/adr/${f}`).join('\n   ')}`,
    );
  }

  const sources = {};
  for (const { file, number } of adrs) {
    const src = readFileSync(join(ADR_DIR, file), 'utf8');
    sources[file] = src;
    const heading = headingNumber(src);
    if (heading === null) {
      problems.push(`нет заголовка «# ${number}. …»: docs/adr/${file}`);
    } else if (heading !== number) {
      problems.push(`заголовок «# ${heading}.» не совпадает с именем docs/adr/${file}`);
    }
  }

  const readme = readFileSync(join(ADR_DIR, 'README.md'), 'utf8');
  const rows = parseIndexRows(readme);
  const listed = new Set(rows.map((r) => r.target));
  const byName = new Set(adrs.map((a) => a.file));

  for (const { file } of adrs) {
    if (!listed.has(file))
      problems.push(`нет строки в docs/adr/README.md: docs/adr/${file}`);
  }
  for (const { number, target } of rows) {
    if (!byName.has(target)) {
      problems.push(`строка оглавления [${number}] ведёт в никуда: ${target}`);
      continue;
    }
    const targetNumber = parseAdrFileName(target)?.number;
    if (targetNumber !== number) {
      problems.push(`строка оглавления [${number}] ссылается на ${target}`);
    }
  }

  // README отдельно не сканируется: все его ссылки на ADR — это строки
  // таблицы, уже проверенные выше, и второе сообщение про тот же дефект
  // только мешает читать вывод.
  for (const [file, src] of Object.entries(sources)) {
    for (const dead of findDeadLinks(src, byName)) {
      problems.push(`битая ссылка на ${dead} в docs/adr/${file}`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`❌ ${p}`);
    console.error(
      '\nОдин номер — одно решение, и каждое решение видно в оглавлении.\n' +
        'Свободный номер ищется и по ещё не слитым веткам:\n' +
        "  git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||'",
    );
    process.exit(1);
  }
  console.log(`✓ нумерация ADR: ${adrs.length} решений, все в оглавлении, ссылки целы`);
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
