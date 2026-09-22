#!/usr/bin/env node
// Проверка нумерации ADR: один номер — одно решение, видно в оглавлении, с
// целыми ссылками — и не занят в чужой ещё не слитой ветке (ниже).
//
// 2026-09-20 номер 0059 заняли два файла сразу (#242, #250), один — без
// строки в оглавлении; чинилось перенумерацией через полрепозитория (#273).
// 2026-09-22 номер 0106 заняли две сессии в разных ветках, обе зелёные
// поодиночке — этот гейт читал только рабочее дерево. Кросс-веточная часть
// (сбор данных, поиск коллизий, adr-claims.mjs) требует сети; её отказ
// проверку пропускает, а не красит CI — тот же урок, что про mongod и
// fastdl.mongodb.org в CI api.
//
// Разбор файла — чистые функции без fs/git ниже; кросс-веточный разбор —
// такие же чистые функции в adr-claims.mjs (файл здесь уже на потолке в 150
// строк, CLAUDE.md, «Храповики»). check-adr-numbers.test.mjs гоняет и те, и
// другие на фикстурах, не на сегодняшнем docs/adr.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { collectCrossBranchAdrData, reportCrossBranch } from './adr-claims.mjs';

/** `0075-lesson-tags-and-tag-screen.md` → `{ number, slug }`; не то имя — null. */
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

/** Номер из заголовка `# NNNN. …` первой непустой строки; иначе null. */
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

/** Ссылки `](NNNN-slug.md)`, ведущие в никуда — переименовали файл, забыли ссылку. */
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

  reportCrossBranch(collectCrossBranchAdrData(adrs, parseAdrFileName), problems);

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
