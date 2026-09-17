#!/usr/bin/env node
// Храповик роботных конструкций в user-facing тексте (docs/VOICE.md).
// Определение через отрицание, канцелярит, метатекст, слова-филлеры и
// служебные мостики — счётчик заморожен пофайлово и может только падать.
// Унаследовано из telegram-bot-2 (свип 2026-07 нашёл эти конструкции по
// всему продукту, не только в статьях).
//
// Снизил — зафиксируй: node scripts/check-robot-phrases.mjs --update
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'robot-phrases-baseline.json');
const UPDATE = process.argv.includes('--update');
const VERBOSE = process.argv.includes('--verbose');

const SCAN_DIRS = ['api/src', 'web/src', 'shared/src'];

// Юридические документы (оферта, политика конфиденциальности) — жанр с
// формальными оборотами, которые юридически точны и не переписываются живым
// языком (docs/VOICE.md). Пока таких страниц в проекте нет — список пуст.
const EXCLUDED = new Set([]);

const PATTERNS = [
  ['eto-ne-eto', /[Ээ]то\s+не\s+[^,.!?;»]{2,60}[,.]\s*(?:[Ээ]то|а)\s/g],
  ['eto-ne-pro', /[Ээ]то\s+не\s+про\s/g],
  ['tire-eto-ne', /[—–]\s*это\s+не\s/g],
  ['ne-prosto', /не\s+просто\s/gi],
  ['ne-znachit', /не\s+значит\s[^.!?]{2,60}[,.]\s*[Ээ]то\s+значит/g],
  [
    'metatext',
    /важно\s+(?:отметить|понимать|помнить)|стоит\s+(?:отметить|сказать|учитывать|помнить)|следует\s+(?:отметить|понимать|помнить)|необходимо\s+отметить|в\s+заключение|в\s+конечном\s+итоге/gi,
  ],
  [
    'kancelyarit',
    /(?<![А-Яа-яЁё])(?:являет(?:ся|ются)|представля(?:ет|ют)\s+собой|осуществля(?:ет|ется|ются|ть)|производится)/gi,
  ],
  [
    'filler',
    /ключев(?:ой|ая|ое|ые|ым|ого|ую)|эффективн(?:ый|ая|ое|ые|ым)|уникальн(?:ый|ая|ое|ые)|значимы(?:й|е)|мощн(?:ый|ое)\s+инструмент|играет\s+(?:важную|ключевую)\s+роль|в\s+современном\s+мире/gi,
  ],
  [
    'bridges',
    /таким\s+образом|однако\s+стоит|при\s+этом\s+важно|тем\s+не\s+менее|в\s+связи\s+с\s+этим|в\s+свою\s+очередь/gi,
  ],
  ['symmetry', /с\s+одной\s+стороны/gi],
  // Слово разработчика, не пользователя (ADR-0040): раздел называется
  // «Вопросы», хранилище называть «банком» в текстах пользователю нельзя.
  // Без `\b` — он не видит границу слова на кириллице (не входит в `\w`);
  // соседние буквы проверяются через lookaround, чтобы не зацепить «банков»,
  // «банкомат».
  ['bank-word', /(?<![а-яёА-ЯЁ])[Бб]анк[аеу]?(?![а-яёА-ЯЁ])/g],
];

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return acc;
  }
  for (const name of entries) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(rel, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.(ts|tsx)$/.test(name)) {
      acc.push(rel);
    }
  }
  return acc;
}

const counts = {};
const details = {};
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (EXCLUDED.has(file)) continue;
    let src;
    try {
      src = readFileSync(join(ROOT, file), 'utf8');
    } catch {
      continue;
    }
    let n = 0;
    src.split('\n').forEach((line, i) => {
      if (!/[А-Яа-я]{4}/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const [name, re] of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          n++;
          (details[file] ||= []).push(`  L${i + 1} [${name}] ${m[0].trim()}`);
        }
      }
    });
    if (n > 0) counts[file] = n;
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (UPDATE) {
  const sorted = Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.log(
    `Бейслайн обновлён: ${total} конструкций в ${Object.keys(counts).length} файлах.`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(
    'Нет бейслайна — сгенерируй: node scripts/check-robot-phrases.mjs --update',
  );
  process.exit(1);
}

const grown = [];
const born = [];
for (const [file, n] of Object.entries(counts)) {
  const was = baseline[file];
  if (was === undefined) born.push([file, n]);
  else if (n > was) grown.push([file, was, n]);
}

if (grown.length || born.length) {
  console.error('❌ Храповик роботных конструкций: стало хуже.\n');
  for (const [file, was, now] of grown) {
    console.error(`  ${file}: ${was} → ${now}`);
    for (const d of details[file] || []) console.error(d);
  }
  for (const [file, n] of born) {
    console.error(`  ${file}: новый файл с ${n} конструкциями (допустимо 0)`);
    for (const d of details[file] || []) console.error(d);
  }
  console.error(
    '\nЧто это значит — docs/VOICE.md: определение через отрицание, канцелярит,\n' +
      'слова-филлеры и служебные мостики в тексте, который видит пользователь.\n' +
      'Перепиши утвердительно. Бейслайн обновляется только вниз:\n' +
      '  node scripts/check-robot-phrases.mjs --update',
  );
  process.exit(1);
}

const baseTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
if (VERBOSE) {
  for (const [file, ds] of Object.entries(details).sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`${file} (${ds.length})`);
    for (const d of ds) console.log(d);
  }
}
console.log(
  total < baseTotal
    ? `✓ Храповик роботных конструкций: ${total} < ${baseTotal} — стало лучше, зафиксируй: node scripts/check-robot-phrases.mjs --update`
    : `✓ Храповик роботных конструкций: ${total} (без роста)`,
);
