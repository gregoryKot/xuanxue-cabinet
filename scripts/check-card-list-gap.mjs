#!/usr/bin/env node
// Детектор списков-карточек без промежутка между строками (CLAUDE.md, раздел
// «Храповики», п.5). Третий повтор одного бага: контейнер `<ul>` объявляется
// как `{ margin: 0, padding: 0, listStyle: 'none' }` без `gap`, а строка
// своего внешнего отступа не задаёт — карточки стоят вплотную и сливаются в
// одну плашку. Первые два раза чинили руками, по одному месту за раз
// (exam-items/ExamItemCard.tsx, channels/ChannelCard.tsx,
// grading/GradingQueueCard.tsx — «пять карточек вплотную давали зазубренные
// углы и швы»), правило без гейта не удержало третий случай. «Правило без
// механизма принуждения не работает» (CLAUDE.md, вступление).
//
// Литерал обязан заявить промежуток явно: `gap:` (обычный список) или
// `overflow: 'hidden'` — это обёртка «список одной карточкой»
// (web/src/components/listCardStyles.ts, `oneCardListStyle`, docs/adr/0043):
// общий фон и радиус на контейнере, строки внутри разделяет волосяная линия
// снизу, а не промежуток. Бейслайна нет — гейт абсолютный, как
// check-route-collisions.mjs и check-name-collisions.mjs.
//
// Разбор — чистые функции без обращения к fs (maskLiterals, findListLiterals,
// findGaplessLists), гоняются на строках-фикстурах в
// check-card-list-gap.test.mjs, а не на сегодняшнем дереве web/src. Обход
// дерева — отдельно, в main(), как в check-route-collisions.mjs.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// Общий проход по строке для maskLiterals и maskComments — оба затирают
// комментарии одинаково, разница только в том, трогать ли содержимое строк,
// поэтому разбор один (CLAUDE.md «Дубли и мёртвый код»: не повторять блок).
function scan(src, { maskStrings }) {
  const n = src.length;
  const out = src.split('');
  const maskAt = (i) => {
    out[i] = src[i] === '\n' ? '\n' : ' ';
  };

  let i = 0;
  while (i < n) {
    const c = src[i];

    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i += 1; // открывающая кавычка остаётся как есть
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          if (maskStrings) {
            maskAt(i);
            maskAt(i + 1);
          }
          i += 2;
          continue;
        }
        if (maskStrings) maskAt(i);
        i += 1;
      }
      if (i < n) i += 1; // закрывающая кавычка остаётся как есть
      continue;
    }

    if (c === '/' && src[i + 1] === '/') {
      i += 2; // `//` остаётся как есть
      while (i < n && src[i] !== '\n') {
        maskAt(i);
        i += 1;
      }
      continue;
    }

    if (c === '/' && src[i + 1] === '*') {
      i += 2; // `/*` остаётся как есть
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        maskAt(i);
        i += 1;
      }
      if (i < n) i += 2; // `*/` остаётся как есть
      continue;
    }

    i += 1;
  }

  return out.join('');
}

/** Копия строки той же длины, где содержимое строковых литералов (`'…'`,
 * `"…"`, `` `…` ``) и комментариев — и строчных, и блочных — заменено
 * пробелами; сами границы (кавычки, открывающая и закрывающая пары
 * комментария) и переносы строк остаются на месте.
 * Нужна, чтобы `{`/`}` внутри строки или комментария не сбивали подсчёт
 * скобок при поиске охватывающего объектного литерала. Экранирование (`\'` и
 * т.п.) учитывается — экранированный символ маскируется вместе с обратным
 * слэшем, но не закрывает литерал. */
export function maskLiterals(src) {
  return scan(src, { maskStrings: true });
}

/** Как maskLiterals, но содержимое строк остаётся как в исходнике — затёрты
 * только комментарии (строки распознаются и пропускаются, чтобы `//`/`/*`
 * внутри них не приняли за начало комментария). Нужна для проверки
 * `gap:`/`overflow: 'hidden'`: значение `'hidden'` само является строкой, и
 * при общей маске (maskLiterals) его текст, как и любой другой строки,
 * стирается вместе с комментариями — тогда `overflow: 'hidden'` в настоящем
 * коде было бы неотличимо от `overflow: 'auto'`. А закомментированный
 * `gap: 10` при этом всё равно не должен считаться объявлением. */
function maskComments(src) {
  return scan(src, { maskStrings: false });
}

/** Индекс охватывающей `{` для позиции `from`: идём по маске назад, `}`
 * означает более глубокий уровень (нужна ещё одна `{` перед тем, как считать
 * найденным), `{` на нулевой глубине — искомая скобка. `-1`, если объектный
 * литерал ничем не охвачен (в реальном коде `listStyle: 'none'` всегда внутри
 * `{…}` — на всякий случай, а не потому что это ожидается). */
function findEnclosingBraceIndex(mask, from) {
  let depth = 0;
  for (let i = from - 1; i >= 0; i -= 1) {
    if (mask[i] === '}') depth += 1;
    else if (mask[i] === '{') {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

/** Индекс `}`, парной открывающей `{` по индексу `open`, по маске. */
function findMatchingBraceIndex(mask, open) {
  let depth = 0;
  for (let i = open; i < mask.length; i += 1) {
    if (mask[i] === '{') depth += 1;
    else if (mask[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Номер строки (1-based) для позиции `index` в исходной строке. */
function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (src[i] === '\n') line += 1;
  }
  return line;
}

// Ширина окна назад от `{`, в котором ищем `const имя = ` /
// `const имя: Тип = `: с запасом под самую длинную реальную аннотацию типа
// (`CSSProperties` с экспортом и модификаторами), но не весь файл — иначе
// более раннее «const x = …» в файле может случайно попасть в окно поиска
// (хотя на конец окна регэксп всё равно не отреагирует, см. комментарий ниже).
const CONST_NAME_WINDOW = 200;

/** Имя константы, которой присвоен объектный литерал, открывающийся в `open`
 * (`const имя = {` или `const имя: Тип = {`, с `export` или без — им
 * предшествующее не важно). `null`, если литерал не присвоен константе прямо
 * перед собой (инлайн-объект в JSX, вложенное свойство и т.п.) — тогда отчёт
 * так и говорит: имени нет.
 *
 * Регэксп заякорён на конец фрагмента (`$` без флага `m` — конец всей
 * подстроки), поэтому совпадает только начало, из которого можно дойти без
 * остатка до самой `{`: более раннее «const a = 1; …» в том же окне поиска
 * не подходит — после его «=» остаётся ещё текст до нашей скобки. */
function findConstName(src, open) {
  const start = Math.max(0, open - CONST_NAME_WINDOW);
  const before = src.slice(start, open);
  const m = /const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*$/.exec(before);
  return m ? m[1] : null;
}

const GAP_RE = /\bgap\s*:/;
const OVERFLOW_HIDDEN_RE = /overflow\s*:\s*['"]hidden['"]/;
const LIST_STYLE_NONE_RE = /listStyle\s*:\s*['"]none['"]/g;

/** Каждый объектный литерал файла, содержащий `listStyle: 'none'`: номер
 * строки, имя константы (или `null`) и заявлен ли промежуток между строками.
 * `listStyle: 'none'` ищем в ИСХОДНОЙ строке (в полной маске `none` затёрт,
 * это содержимое строкового литерала) и по ней же находим охватывающие
 * скобки (полная маска гасит и вложенные строки, и комментарии — иначе `{`
 * внутри них собьёт подсчёт). А вот `gap:`/`overflow: 'hidden'` внутри
 * найденного литерала проверяем по маске БЕЗ ЗАТИРАНИЯ СТРОК (maskComments):
 * `'hidden'` — это тоже строка, её текст нужен, чтобы отличить от
 * `overflow: 'auto'`; при этом закомментированный `gap: 10`
 * («// раньше был gap, убрали») по-прежнему не считается объявлением. */
export function findListLiterals(src) {
  const mask = maskLiterals(src);
  const commentsMasked = maskComments(src);
  const literals = [];

  for (const match of src.matchAll(LIST_STYLE_NONE_RE)) {
    const open = findEnclosingBraceIndex(mask, match.index);
    if (open === -1) continue;
    const close = findMatchingBraceIndex(mask, open);
    if (close === -1) continue;

    const checkedBody = commentsMasked.slice(open, close + 1);
    const hasGap = GAP_RE.test(checkedBody) || OVERFLOW_HIDDEN_RE.test(checkedBody);

    literals.push({ line: lineAt(src, open), name: findConstName(src, open), hasGap });
  }

  return literals;
}

/** Литералы файла `fileLabel`, у которых промежуток между строками не
 * заявлен — то, что попадёт в отчёт гейта. */
export function findGaplessLists(fileLabel, src) {
  return findListLiterals(src)
    .filter((l) => !l.hasGap)
    .map(({ line, name }) => ({ file: fileLabel, line, name }));
}

function main() {
  const ROOT = join(import.meta.dirname, '..');
  const SRC = join(ROOT, 'web', 'src');

  function* walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        yield* walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(p)) continue;
      if (p.includes('.test.')) continue;
      yield p;
    }
  }

  let totalLists = 0;
  const offenders = [];
  for (const file of walk(SRC)) {
    const fileLabel = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');
    totalLists += findListLiterals(src).length;
    offenders.push(...findGaplessLists(fileLabel, src));
  }

  if (offenders.length > 0) {
    for (const { file, line, name } of offenders) {
      const label = name === null ? 'без имени константы' : name;
      console.error(
        `❌ список без промежутка между строками: ${file}:${line} (${label})`,
      );
    }
    console.error(
      "У `<ul>`/`<ol>` со `listStyle: 'none'` нет своего внешнего отступа — без\n" +
        '`gap` карточки встают вплотную и сливаются в одну плашку. Добавь `gap` в\n' +
        'объект стиля контейнера или, если это обёртка «список одной карточкой»\n' +
        '(строки разделяет волосяная линия, см. oneCardListStyle в\n' +
        "web/src/components/listCardStyles.ts), добавь `overflow: 'hidden'`.",
    );
    process.exit(1);
  }
  console.log(`✓ промежуток между карточками списка задан везде (${totalLists} списков)`);
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
