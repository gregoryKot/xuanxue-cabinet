#!/usr/bin/env node
// Сверка env-переменных: каждая переменная, которую реально читает api/src
// (через ConfigService.get('NAME'), process.env.NAME или поля класса
// api/src/config/env.validation.ts, если он есть), обязана быть строкой в
// .env.example — иначе деплой падает на переменной, о которой никто не
// вспомнил задокументировать. CLAUDE.md, раздел «Конфигурация»: env только
// через ConfigService, ничего не хардкодится — .env.example держит канонический
// список того, что вообще нужно приложению.
//
// Исключения — переменные окружения платформы/рантайма, не специфичные для
// приложения: NODE_ENV, TZ, CI, RAILWAY_*.
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..');
const API_SRC = join(ROOT, 'api', 'src');
const ENV_EXAMPLE_PATH = join(ROOT, '.env.example');
const ENV_VALIDATION_PATH = join(API_SRC, 'config', 'env.validation.ts');

const EXCLUDE_EXACT = new Set(['NODE_ENV', 'TZ', 'CI']);
const isExcluded = (name) => EXCLUDE_EXACT.has(name) || name.startsWith('RAILWAY_');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(p)) yield p;
  }
}

// name -> Set(относительных путей файлов, где встретилась)
const found = new Map();
function record(name, file) {
  if (isExcluded(name)) return;
  if (!found.has(name)) found.set(name, new Set());
  found.get(name).add(relative(ROOT, file));
}

const CONFIG_GET_RE =
  /\bconfig(?:Service)?\s*\.\s*get(?:<[^>()]*>)?\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g;
const PROCESS_ENV_RE = /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g;

for (const file of walk(API_SRC)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(CONFIG_GET_RE)) record(m[1], file);
  for (const m of src.matchAll(PROCESS_ENV_RE)) record(m[1], file);
}

if (existsSync(ENV_VALIDATION_PATH)) {
  const src = readFileSync(ENV_VALIDATION_PATH, 'utf8');
  const FIELD_RE = /^\s+([A-Z][A-Z0-9_]+)[?!]?:/gm;
  for (const m of src.matchAll(FIELD_RE)) record(m[1], ENV_VALIDATION_PATH);
}

let envExample;
try {
  envExample = readFileSync(ENV_EXAMPLE_PATH, 'utf8');
} catch {
  console.error(`❌ не найден ${relative(ROOT, ENV_EXAMPLE_PATH)}`);
  process.exit(1);
}
const documented = new Set(
  [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
);

const missing = [...found.keys()].filter((name) => !documented.has(name)).sort();

if (missing.length) {
  console.error('❌ переменные окружения читаются в коде, но нет в .env.example:');
  for (const name of missing) {
    console.error(`   ${name}`);
    for (const file of found.get(name)) console.error(`      ${file}`);
  }
  console.error(
    '\nДобавь строку `NAME=` (с комментарием, что это и как получить) в .env.example — ' +
      'CLAUDE.md, раздел «Конфигурация»: env только через ConfigService, весь список ' +
      'нужных переменных виден в одном файле.',
  );
  process.exit(1);
}

console.log(`✓ .env.example покрывает все ${found.size} переменных, читаемых в api/src`);
