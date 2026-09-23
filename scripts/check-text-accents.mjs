#!/usr/bin/env node
// Храповик типографских акцентов в тексте пользователя (docs/VOICE.md
// «Акценты», решение — docs/adr/0124-accent-is-bold-on-the-fact.md). Длинный
// абзац без единого выделенного факта (числа, срока, имени, что произойдёт)
// читается сплошным полотном — глазу не за что зацепиться; отзыв владельца
// 2026-09-23 со снимком карточки экзамена: «всё сплошняком, можно акценты?».
// Маркер акцента — `**жирным**`, его рисует web/src/components/RichText.tsx.
//
// Сам разбор файла (компилятор TypeScript, единица текста, склейка через `+`)
// — в scripts/text-accents-scan.mjs; здесь — обход дерева, бейслайн и отчёт.
//
// Три проверки:
//  1. Храповик «плоский абзац» (только web/src) — единица ≥ FLAT_PARAGRAPH_MIN_LENGTH
//     знаков без маркера `**`. Пофайловый бейслайн, снизил — зафиксируй:
//     node scripts/check-text-accents.mjs --update
//  2. Жёсткая ошибка (не храповик): маркер `**` в тексте api/src или
//     shared/src. Эти строки уходят в Telegram простым текстом — маркер
//     показался бы ученику звёздочками на экране. Акценты — только в web/.
//  3. Жёсткая ошибка: непарный маркер в единице из web/src — нечётное число
//     вхождений `**`: половина маркера осталась бы на экране звёздочками.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  FLAT_PARAGRAPH_MIN_LENGTH,
  collectTextUnits,
  isFlatParagraph,
  findStrayMarks,
  findForbiddenMarks,
} from './text-accents-scan.mjs';

const ROOT = join(import.meta.dirname, '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'text-accents-baseline.json');
const UPDATE = process.argv.includes('--update');
const VERBOSE = process.argv.includes('--verbose');

// Каталоги, где живёт текст пользователю, и метка источника для проверок
// 2 и 3 (маркер разрешён только в web/src).
const SCAN_ROOTS = [
  { dir: 'web/src', source: 'web' },
  { dir: 'api/src', source: 'api' },
  { dir: 'shared/src', source: 'shared' },
];

function walk(absDir, acc = []) {
  let entries;
  try {
    entries = readdirSync(absDir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === 'test-support') continue;
    const p = join(absDir, name);
    if (statSync(p).isDirectory()) {
      walk(p, acc);
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(name)) continue;
    acc.push(p);
  }
  return acc;
}

/** Первые `max` знаков текста единицы для короткой строки в отчёте, с
 * многоточием, если обрезали — полный текст в отчёте не нужен, нужно узнать
 * место. */
function preview(text, max = 90) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function main() {
  const allUnits = [];
  for (const { dir, source } of SCAN_ROOTS) {
    for (const file of walk(join(ROOT, dir))) {
      const fileLabel = relative(ROOT, file);
      const src = readFileSync(file, 'utf8');
      for (const unit of collectTextUnits(fileLabel, src)) {
        allUnits.push({ ...unit, source });
      }
    }
  }

  const webUnits = allUnits.filter((u) => u.source === 'web');
  const forbidden = findForbiddenMarks(allUnits.filter((u) => u.source !== 'web'));
  const stray = findStrayMarks(webUnits);

  if (forbidden.length > 0 || stray.length > 0) {
    if (forbidden.length > 0) {
      console.error('❌ Маркер акцента `**` в тексте api/src или shared/src:\n');
      for (const u of forbidden) {
        console.error(`  ${u.file}:${u.line} «${preview(u.text)}»`);
      }
      console.error(
        '\nЭти строки уходят в Telegram простым текстом — `**` показался бы\n' +
          'ученику звёздочками на экране, а не жирным. Акценты живут только в\n' +
          'web/ (web/src/components/RichText.tsx).',
      );
    }
    if (stray.length > 0) {
      if (forbidden.length > 0) console.error('');
      console.error('❌ Непарный маркер `**` в тексте web/src:\n');
      for (const u of stray) {
        console.error(`  ${u.file}:${u.line} «${preview(u.text)}»`);
      }
      console.error(
        '\nНечётное число `**` в единице текста — половина маркера останется на\n' +
          'экране звёздочками вместо жирного текста. Проверь пары.',
      );
    }
    process.exit(1);
  }

  const flatByFile = {};
  const flatDetails = {};
  for (const u of webUnits) {
    if (!isFlatParagraph(u)) continue;
    flatByFile[u.file] = (flatByFile[u.file] ?? 0) + 1;
    (flatDetails[u.file] ??= []).push(`  L${u.line} «${preview(u.text)}»`);
  }

  const total = Object.values(flatByFile).reduce((a, b) => a + b, 0);

  if (UPDATE) {
    const sorted = Object.fromEntries(
      Object.entries(flatByFile).sort(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
    console.log(
      `Бейслайн обновлён: ${total} плоских абзацев в ${Object.keys(flatByFile).length} файлах.`,
    );
    process.exit(0);
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    console.error(
      'Нет бейслайна — сгенерируй: node scripts/check-text-accents.mjs --update',
    );
    process.exit(1);
  }

  const grown = [];
  const born = [];
  for (const [file, n] of Object.entries(flatByFile)) {
    const was = baseline[file];
    if (was === undefined) born.push([file, n]);
    else if (n > was) grown.push([file, was, n]);
  }

  if (grown.length || born.length) {
    console.error('❌ Храповик плоских абзацев: стало хуже.\n');
    for (const [file, was, now] of grown) {
      console.error(`  ${file}: ${was} → ${now}`);
      for (const d of flatDetails[file] || []) console.error(d);
    }
    for (const [file, n] of born) {
      console.error(`  ${file}: новый файл с ${n} плоскими абзацами (допустимо 0)`);
      for (const d of flatDetails[file] || []) console.error(d);
    }
    console.error(
      `\nАбзац от ${FLAT_PARAGRAPH_MIN_LENGTH} знаков без выделенного факта (число,\n` +
        'срок, имя, что произойдёт) — сплошное полотно, глаз не цепляется ни за\n' +
        'что. Оберни факт в `**жирным**` (web/src/components/RichText.tsx).\n' +
        'Бейслайн обновляется только вниз:\n' +
        '  node scripts/check-text-accents.mjs --update',
    );
    process.exit(1);
  }

  const baseTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
  if (VERBOSE) {
    for (const [file, ds] of Object.entries(flatDetails).sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      console.log(`${file} (${ds.length})`);
      for (const d of ds) console.log(d);
    }
  }
  console.log(
    total < baseTotal
      ? `✓ Храповик плоских абзацев: ${total} < ${baseTotal} — стало лучше, зафиксируй: node scripts/check-text-accents.mjs --update`
      : `✓ Храповик плоских абзацев: ${total} (без роста)`,
  );
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
