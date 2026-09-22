#!/usr/bin/env node
// Гейт на CLAUDE.md, правило 3: «новый эндпоинт = DTO с class-validator +
// e2e на владение». Держалось только на ревью — этот скрипт делает правило
// механизмом: для каждого api/src/**/*.controller.ts должна найтись хотя бы
// одна api/test/*.e2e-spec.ts, которая (а) обращается к его маршрутам и
// (б) содержит утверждение об отказе (401/403/404). Нет такой — CI красный,
// как писать такую спеку — api/test/e2e-support/README.md.
//
// Разбор вынесен в чистые функции без обращения к fs — check-ownership-e2e.
// test.mjs гоняет их на строках-фикстурах, не на реальном дереве.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { parseControllerPrefixes, extractRoutes } from './check-route-collisions.mjs';

// Общий "40" — числа отказа все начинаются с него: 401, 403, 404.
const DENIAL_PATTERN =
  /\.expect\(40[134]\)|\btoBe\(40[134]\)|\btoEqual\(40[134]\)|HttpStatus\.(FORBIDDEN|UNAUTHORIZED|NOT_FOUND)\b/;

/** Ключи поиска по спекам для одного контроллера: `/api/<префикс>` на
 * каждый префикс из `@Controller(...)` (parseControllerPrefixes — общий
 * парсер с check-route-collisions.mjs, дублировать нельзя, jscpd-храповик;
 * комментарии он гасит сам через scripts/source-text.mjs).
 * Пустой префикс (`@Controller()` без аргумента или с нераспознанным) —
 * своего сегмента нет, берём первый сегмент пути каждого хендлера через
 * extractRoutes: у exam-attempts.controller.ts так выйдут `exams` и
 * `attempts` — оба корня, которыми он реально отвечает. */
export function controllerSearchKeys(src) {
  const prefixes = parseControllerPrefixes(src) ?? [];
  const named = [...new Set(prefixes.filter((p) => p !== ''))];
  if (named.length > 0) return named.map((p) => `/api/${p}`);

  const segments = new Set();
  for (const { route } of extractRoutes('', src)) {
    const path = route.split(' ')[1] ?? '';
    const [first] = path.replace(/^\//, '').split('/');
    if (first) segments.add(first);
  }
  return [...segments].map((s) => `/api/${s}`);
}

/** Спека содержит хотя бы одно утверждение об отказе — 401/403/404 в одной
 * из принятых форм: supertest `.expect(...)`, jest `toBe`/`toEqual`,
 * `HttpStatus.FORBIDDEN|UNAUTHORIZED|NOT_FOUND`. */
export function hasDenialAssertion(specSrc) {
  return DENIAL_PATTERN.test(specSrc);
}

/** Контроллеры без покрывающей спеки. Спека «касается» контроллера, если её
 * текст содержит хотя бы один его ключ поиска (строка `/api/<префикс>` как
 * подстрока), и «закрывает» его, если хотя бы одна из касающихся спек
 * содержит утверждение об отказе — сама спека, не конкретный `it()` внутри:
 * как и check-route-collisions.mjs, гейт грубый по тексту файла, точнее
 * значило бы парсить TS. */
export function findUncoveredControllers(controllers, specs) {
  const uncovered = [];
  for (const { fileLabel, src } of controllers) {
    const keys = controllerSearchKeys(src);
    const touching = specs.filter((spec) => keys.some((key) => spec.src.includes(key)));
    const covered = touching.some((spec) => hasDenialAssertion(spec.src));
    if (!covered) uncovered.push({ file: fileLabel, keys });
  }
  return uncovered;
}

function main() {
  const ROOT = join(import.meta.dirname, '..');
  const SRC = join(ROOT, 'api', 'src');
  const TEST = join(ROOT, 'api', 'test');

  function* walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) yield* walk(p);
      else if (p.endsWith('.controller.ts')) yield p;
    }
  }

  const controllers = [...walk(SRC)].map((file) => ({
    fileLabel: relative(ROOT, file),
    src: readFileSync(file, 'utf8'),
  }));
  const specs = readdirSync(TEST)
    .filter((name) => name.endsWith('.e2e-spec.ts'))
    .map((name) => ({
      fileLabel: relative(ROOT, join(TEST, name)),
      src: readFileSync(join(TEST, name), 'utf8'),
    }));

  const uncovered = findUncoveredControllers(controllers, specs);

  if (uncovered.length > 0) {
    for (const { file, keys } of uncovered) {
      console.error(`❌ нет e2e на владение: ${file}`);
      console.error(`   искали спеку с ${keys.join(' или ')} и утверждением 401/403/404`);
    }
    console.error(
      'Каждый новый контроллер — e2e-тест, что пользователь А не видит и не\n' +
        'меняет данные пользователя Б (CLAUDE.md, правило 3). Как писать такой\n' +
        'тест — api/test/e2e-support/README.md.',
    );
    process.exit(1);
  }
  console.log(`✓ e2e на владение есть у всех контроллеров (${controllers.length})`);
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте
// из теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
