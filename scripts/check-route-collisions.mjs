#!/usr/bin/env node
// Детектор коллизий HTTP-маршрутов: один маршрут — один контроллер. Nest на
// дубли не ругается сам, а второй регистрант — мёртвый код с риском
// разъехавшейся логики (см. CLAUDE.md, раздел «Храповики», п.5).
//
// Разбор вынесен в чистые функции (parseControllerPrefixes, extractRoutes,
// findCollisions) без обращения к fs — check-route-collisions.test.mjs гоняет
// их на строках-фикстурах, не на реальном дереве api/src.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripComments } from './source-text.mjs';

const ROUTE_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All'];

/** Аргумент `@Controller(...)` → список префиксов. `@Controller()` — один
 * пустой префикс; `@Controller('x')`/`@Controller("x")` — один префикс;
 * `@Controller(['a', 'b'])` — префикс на каждый элемент массива (Nest
 * регистрирует маршруты под каждым). Неизвестный вид аргумента (объект,
 * переменная) — тоже один пустой префикс, как раньше: не ловим коллизию по
 * тексту, но и не падаем на разборе.
 *
 * Комментарии гасятся до поиска: берётся первое вхождение в файле, и
 * комментарий-объяснение со словом `@Controller()` выше настоящего
 * декоратора подменял префикс пустым — у api/src/auth/join.controller.ts
 * гейт из-за этого сторожил `POST /join/check` вместо настоящего
 * `POST /auth/join/check` (аудит 2026-09-22, docs/audits/). */
export function parseControllerPrefixes(src) {
  const m = /@Controller\(([^)]*)\)/.exec(stripComments(src));
  if (!m) return null;
  const arg = m[1].trim();
  if (arg === '') return [''];
  const quoted = /^['"]([^'"]*)['"]$/.exec(arg);
  if (quoted) return [quoted[1]];
  if (arg.startsWith('[') && arg.endsWith(']')) {
    const items = [...arg.matchAll(/['"]([^'"]*)['"]/g)].map((mm) => mm[1]);
    if (items.length > 0) return items;
  }
  return [''];
}

/** Маршруты одного файла контроллера: каждый префикс `@Controller` ×каждый
 * `@Get/@Post/.../@All` в файле. `fileLabel` — что положить в список файлов
 * маршрута (относительный путь при разборе дерева, любая строка в тесте). */
export function extractRoutes(fileLabel, src) {
  // Тот же сканер, что и у префикса выше: закомментированный `@Get('old')`
  // рядом с живым кодом иначе даёт маршрут-призрак и с ним ложную коллизию.
  const code = stripComments(src);
  const prefixes = parseControllerPrefixes(code) ?? [''];
  const methodPattern = new RegExp(
    `@(${ROUTE_METHODS.join('|')})\\((?:['"]([^'"]*)['"])?\\)`,
    'g',
  );
  const routes = [];
  for (const m of code.matchAll(methodPattern)) {
    const handlerPath = m[2] ?? '';
    for (const prefix of prefixes) {
      const path = [prefix, handlerPath]
        .filter(Boolean)
        .join('/')
        .replace(/:[^/]+/g, ':*');
      routes.push({ route: `${m[1].toUpperCase()} /${path}`, file: fileLabel });
    }
  }
  return routes;
}

/** {route: [file, ...]} по всем `entries` ({fileLabel, src}), только маршруты
 * с более чем одним файлом-регистрантом. */
export function findCollisions(entries) {
  const routes = {};
  for (const { fileLabel, src } of entries) {
    for (const { route, file } of extractRoutes(fileLabel, src)) {
      (routes[route] ??= []).push(file);
    }
  }
  const collisions = {};
  for (const [route, files] of Object.entries(routes)) {
    if (files.length > 1) collisions[route] = files;
  }
  return { routes, collisions };
}

function main() {
  const ROOT = join(import.meta.dirname, '..');
  const SRC = join(ROOT, 'api', 'src');

  function* walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) yield* walk(p);
      else if (p.endsWith('.controller.ts')) yield p;
    }
  }

  const entries = [];
  for (const file of walk(SRC)) {
    entries.push({ fileLabel: relative(ROOT, file), src: readFileSync(file, 'utf8') });
  }

  const { routes, collisions } = findCollisions(entries);

  let failed = false;
  for (const [route, files] of Object.entries(collisions)) {
    failed = true;
    console.error(`❌ маршрут-дубль: ${route}\n   ${files.join('\n   ')}`);
  }
  if (failed) {
    console.error(
      'Один маршрут — один контроллер. Отвечает тот, чей модуль импортирован\n' +
        'раньше; второй — мёртвый код с риском разъехавшейся логики.',
    );
    process.exit(1);
  }
  console.log(`✓ коллизий маршрутов нет (${Object.keys(routes).length} маршрутов)`);
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
