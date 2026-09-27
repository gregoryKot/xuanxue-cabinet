#!/usr/bin/env node
// Храповик «у страницы-редактора есть чем читать запись» (CLAUDE.md,
// раздел «Храповики», п.5). Инцидент 2026-09-27: `useMaterialEditor.ts`
// вызывал общий `hooks/useEntityEditor.ts` с `MATERIALS_PATH`, тот читает
// запись через `GET <коллекция>/:id` — а у `MaterialsController` такого
// маршрута не было вовсе (только list/create/patch/delete), в отличие от
// всех соседних редакторов (classes, channels, exams, exam-items, lessons).
// Открытие `/materials/<id>` в браузере отвечало «Cannot GET
// /api/materials/<id>». Веб-тесты мокают `apiFetch` (web/src/test-support/
// apiFetchMock.ts) — они проверяют, что хук зовёт правильный путь, а не то,
// что этот путь существует на сервере, поэтому обе стороны молчали: web
// думал, что бэкенд ответит, e2e материалов ни разу не читал запись по id.
//
// Разбор — та же чистая функция, что и у остальных гейтов на регулярках
// (CLAUDE.md, шапка check-route-collisions.mjs): find*/resolve*/check* без
// fs, check-editor-routes.test.mjs гоняет их на строках-фикстурах.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripComments } from './source-text.mjs';
import { extractRoutes } from './check-route-collisions.mjs';

const ROOT = join(import.meta.dirname, '..');
const WEB_SRC = join(ROOT, 'web', 'src');
const API_SRC = join(ROOT, 'api', 'src');
const API_PATHS_FILE = join(WEB_SRC, 'api', 'apiPaths.ts');

// `(?<!function )` — единственный вызов `useEntityEditor<...>(...)`, что не
// вызов, а объявление самого хука (`export function useEntityEditor<TDto,
// ...>(collectionPath: string, ...)` в hooks/useEntityEditor.ts): там перед
// именем стоит `function `, у настоящего вызова — нет.
const CALL_RE =
  /(?<!function )useEntityEditor(?:\s*<[\s\S]*?>)?\s*\(\s*([A-Za-z_$][\w$]*)/g;

/** Идентификаторы первого аргумента каждого вызова `useEntityEditor(...)` в
 * исходнике файла (комментарии уже погашены вызывающей стороной). Порядок —
 * как в файле, повторы не схлопываются: одна и та же константа, вызванная
 * дважды в одном файле, — не ошибка гейта. */
export function findUseEntityEditorPathArgs(src) {
  const code = stripComments(src);
  return [...code.matchAll(CALL_RE)].map((m) => m[1]);
}

// `export const NAME = '...'` / `"..."` — только простые строковые
// литералы (apiPaths.ts). Составные пути (`` `${X}?limit=...` ``,
// функции вроде `materialsListPath`) не годятся первым аргументом
// useEntityEditor — ни один текущий редактор так не делает (см. шапку).
const CONST_RE = /export const ([A-Z][A-Z0-9_]*)\s*=\s*(['"])([^'"]*)\2/g;

/** Map<имяКонстанты, значение> из текста apiPaths.ts. */
export function resolvePathConstants(apiPathsSrc) {
  const code = stripComments(apiPathsSrc);
  const constants = new Map();
  for (const m of code.matchAll(CONST_RE)) constants.set(m[1], m[3]);
  return constants;
}

/**
 * Сверка использований `useEntityEditor` в `webFiles` ({file, src}) с
 * маршрутами `routes` (Set строк вида `GET /materials/:*`, тот же формат,
 * что отдаёт extractRoutes из check-route-collisions.mjs) через константы
 * `apiPathsSrc`. Возвращает находки: `unresolved` — константу не нашли в
 * apiPaths.ts (имя набрано с опечаткой, переменная, а не константа модуля,
 * или составной путь), `missing-route` — путь есть, а `GET .../:id` в api
 * нет.
 */
export function checkEditorRoutes({ webFiles, apiPathsSrc, routes }) {
  const constants = resolvePathConstants(apiPathsSrc);
  const problems = [];
  for (const { file, src } of webFiles) {
    for (const constName of findUseEntityEditorPathArgs(src)) {
      const pathValue = constants.get(constName);
      if (pathValue === undefined) {
        problems.push({ file, constName, kind: 'unresolved' });
        continue;
      }
      const collection = pathValue.replace(/^\//, '');
      const expectedRoute = `GET /${collection}/:*`;
      if (!routes.has(expectedRoute)) {
        problems.push({
          file,
          constName,
          path: pathValue,
          expectedRoute,
          kind: 'missing-route',
        });
      }
    }
  }
  return problems;
}

function* walk(dir, matches) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      yield* walk(p, matches);
    } else if (matches(name)) {
      yield p;
    }
  }
}

function main() {
  const webFiles = [
    ...walk(WEB_SRC, (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)),
  ].map((file) => ({ file: relative(ROOT, file), src: readFileSync(file, 'utf8') }));

  const apiPathsSrc = readFileSync(API_PATHS_FILE, 'utf8');

  const controllerFiles = [...walk(API_SRC, (name) => name.endsWith('.controller.ts'))];
  const routes = new Set();
  for (const file of controllerFiles) {
    const src = readFileSync(file, 'utf8');
    for (const { route } of extractRoutes(relative(ROOT, file), src)) routes.add(route);
  }

  const problems = checkEditorRoutes({ webFiles, apiPathsSrc, routes });

  if (problems.length > 0) {
    for (const problem of problems) {
      if (problem.kind === 'unresolved') {
        console.error(
          `❌ ${problem.file}: useEntityEditor(${problem.constName}, ...) — константа ` +
            `${problem.constName} не найдена как простой строковый литерал в ` +
            `web/src/api/apiPaths.ts (export const ${problem.constName} = '...').`,
        );
      } else {
        console.error(
          `❌ ${problem.file}: useEntityEditor(${problem.constName}, ...) читает запись ` +
            `по «${problem.path}/:id», а в api нет маршрута ` +
            `GET ${problem.path}/:id (см. api/src/**/*.controller.ts).`,
        );
      }
    }
    console.error(
      'Страница-редактор (useEntityEditor) не откроется по прямой ссылке без ' +
        "GET <коллекция>/:id на сервере — добавь @Get(':id') контроллеру " +
        '(инцидент 2026-09-27, «Cannot GET /api/materials/:id»).',
    );
    process.exit(1);
  }

  console.log(
    `✓ у каждого useEntityEditor есть GET <коллекция>/:id (${webFiles.length} файлов web проверено)`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
