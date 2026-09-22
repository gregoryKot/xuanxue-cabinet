#!/usr/bin/env node
// Гейт кегля контрола (CLAUDE.md «Храповики», docs/adr/0109). Safari на iPhone
// масштабирует всю страницу при фокусе в поле с кеглем меньше 16px и обратно не
// отзумливает — отзыв владельца 2026-09-22: «при нажатии на поле почты всё
// приложение зумится ближе». Причина: инлайновый `font: 'inherit'` из
// `getInputStyle()` (components/Field.tsx) тянул в каждое поле 15px с `body`, а
// инлайн-стиль в каскаде сильнее правила таблицы стилей — CSS его не перебивал.
//
// Держит обе половины: (а) в web/src/index.css есть правило `input, textarea,
// select` с кеглем ≥16px; (б) ни один input/textarea/select в web/src не задаёт
// `font`/`fontSize` инлайном — иначе он вернул бы зум, а правило (а) не поможет.
//
// Разбор — чистые функции без fs, гоняются на фикстурах в
// check-control-font-size.test.mjs; обход дерева — в main(), как в
// check-card-list-gap.mjs, откуда взята и maskLiterals (CLAUDE.md «Дубли»).
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { maskLiterals } from './check-card-list-gap.mjs';

const CONTROL_TAG_RE = /<(input|textarea|select)\b/g;
// `font:` — шорткод, задаёт кегль. `fontFamily` зума не касается и не ловится:
// `\s*:` сразу после «font» этого не даст — после «font» там идёт «Family».
const FONT_PROP_RE = /^(?:font|fontSize)\s*:/;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
const CALL_RE = /^([A-Za-z_$][\w$]*)\s*\(/;
// Самая длинная живая цепочка — «тег → имя → спред → getInputStyle() → переход
// по импорту → тело функции → return → спред controlSizes[size]», 7 шагов.
const MAX_DEPTH = 14;

const lineAt = (src, index) => src.slice(0, index).split('\n').length;

/** Индекс парной закрывающей для открывающей `{`/`(` в `openIdx`. */
function matchBalanced(text, openIdx) {
  const open = text[openIdx];
  const close = open === '{' ? '}' : open === '(' ? ')' : null;
  if (!close) return -1;
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Выражение справа от `pos` (после `=`/`return`): объектный литерал `{ … }`,
 * стрелка `(…) => ({ … })` (разворачивается в литерал тела) или
 * идентификатор/вызов. `null` — форма не распознана, гейт молчит о
 * непонятом, как check-adr-numbers.mjs без сети. */
function readExpr(text, pos) {
  let i = pos;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] === '{') {
    const end = matchBalanced(text, i);
    return end === -1 ? null : text.slice(i, end + 1);
  }
  if (text[i] === '(') {
    const close = matchBalanced(text, i);
    if (close === -1) return null;
    let j = close + 1;
    while (j < text.length && /\s/.test(text[j])) j += 1;
    if (text.slice(j, j + 2) !== '=>') return null;
    j += 2;
    while (j < text.length && /\s/.test(text[j])) j += 1;
    if (text[j] !== '(') return null; // разбираем только `(…) => ({ … })`
    return readExpr(text, j + 1);
  }
  const m = /^[A-Za-z_$][\w$]*\s*(?:\([^()]*\))?/.exec(text.slice(i));
  return m ? m[0].trim() : null;
}

/** Выражение `style={…}` тега из `tagStart` маскированной строки. Конец тега —
 * первый `>` вне вложенных `{}`: атрибут-стрелка `(e) => …` держит свой `>`. */
function findTagStyleExpr(masked, tagStart) {
  let i = tagStart;
  let depth = 0;
  while (i < masked.length) {
    const c = masked[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) break;
    i += 1;
  }
  const tagText = masked.slice(tagStart, i);
  const m = /\bstyle\s*=\s*\{/.exec(tagText);
  if (!m) return null;
  const openIdx = tagStart + m.index + m[0].length - 1; // `{` JSX-контейнера
  const closeIdx = matchBalanced(masked, openIdx);
  if (closeIdx === -1) return null;
  return readExpr(masked.slice(openIdx + 1, closeIdx), 0);
}

/** Каждый `<input>`/`<textarea>`/`<select>` файла с выражением его `style`
 * (пропущен, если атрибута нет вовсе). */
function findControlStyleExprs(src, masked) {
  const results = [];
  CONTROL_TAG_RE.lastIndex = 0;
  let match;
  while ((match = CONTROL_TAG_RE.exec(masked))) {
    const expr = findTagStyleExpr(masked, match.index);
    if (expr !== null) {
      results.push({ tag: match[1], line: lineAt(src, match.index), expr });
    }
  }
  return results;
}

/** Список через запятую верхнего уровня — вложенные `{}`/`()`/`[]` не
 * считаются разделителем. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{' || c === '(' || c === '[') depth += 1;
    else if (c === '}' || c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Объявляет ли литерал (со своими внешними `{}`) `font`/`fontSize`
 * верхнего уровня, и имена его спредов верхнего уровня (`...ИМЯ`). */
function scanObjectLiteral(objText) {
  const entries = splitTopLevel(objText.slice(1, -1));
  let hasFont = false;
  const spreads = [];
  for (const raw of entries) {
    // maskLiterals гасит ТЕКСТ комментария, но оставляет сами `//` и `/* */`,
    // а запятых в погашенном тексте уже нет — значит комментарий перед
    // свойством попадает в одну запись со свойством. Без этой чистки запись
    // начиналась бы с `//`, и проверки ниже (обе привязаны к её началу) не
    // увидели бы ни `fontSize:` под комментарием, ни спред под ним: первая
    // версия гейта ровно так и пропустила подсаженный `fontSize: 14` в
    // getInputStyle(), где каждое свойство стоит под своим комментарием
    // (проверка 2026-09-22, до мержа).
    const entry = raw.replace(/^(?:\s|\/\/|\/\*|\*\/|\*)+/, '').trim();
    if (!entry) continue;
    if (entry.startsWith('...')) spreads.push(entry.slice(3).trim());
    else if (FONT_PROP_RE.test(entry)) hasFont = true;
  }
  return { hasFont, spreads };
}

/** Объявление `name` в файле: `const NAME = …` или `export function NAME(…)
 * { … return …; }` — правая часть как текст (readExpr), `null` — нет такого
 * имени. */
function findDeclarationExpr(name, masked) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const constMatch = new RegExp(`const\\s+${esc}\\b\\s*(?::[^=]+)?=`).exec(masked);
  if (constMatch) return readExpr(masked, constMatch.index + constMatch[0].length);
  const fnMatch = new RegExp(`function\\s+${esc}\\s*\\(`).exec(masked);
  if (!fnMatch) return null;
  const parenOpen = fnMatch.index + fnMatch[0].length - 1;
  const parenClose = matchBalanced(masked, parenOpen);
  if (parenClose === -1) return null;
  const bodyOpen = masked.indexOf('{', parenClose);
  if (bodyOpen === -1) return null;
  const bodyClose = matchBalanced(masked, bodyOpen);
  if (bodyClose === -1) return null;
  const body = masked.slice(bodyOpen, bodyClose + 1);
  const retMatch = /\breturn\b/.exec(body);
  return retMatch ? readExpr(body, retMatch.index + retMatch[0].length) : null;
}

/** Файл, откуда `fileKey` относительным импортом берёт `name`; `null` — нет
 * такого импорта или он ведёт не в переданную карту файлов. */
function findRelativeImportSource(name, src, fileKey, files) {
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const names = m[1].split(',').map((s) => s.replace(/\s+as\s+.*/, '').trim());
    if (!names.includes(name)) continue;
    const base = join(dirname(fileKey), m[2]).split('\\').join('/');
    for (const ext of ['.tsx', '.ts']) {
      if (`${base}${ext}` in files) return `${base}${ext}`;
    }
  }
  return null;
}

/** `font`/`fontSize` в `exprText` (файл `fileKey`) — само или через спред/вызов,
 * раскрытый резолвером. `canHop` — можно ли ещё перейти в файл по импорту:
 * не больше одного перехода на всю цепочку. */
function exprHasFont(exprText, fileKey, files, depth, canHop) {
  if (depth <= 0 || exprText === null) return false;
  const trimmed = exprText.trim();
  if (trimmed.startsWith('{')) {
    const { hasFont, spreads } = scanObjectLiteral(trimmed);
    if (hasFont) return true;
    return spreads.some((s) => exprHasFont(s, fileKey, files, depth - 1, canHop));
  }
  const call = CALL_RE.exec(trimmed);
  const name = call ? call[1] : IDENT_RE.test(trimmed) ? trimmed : null;
  if (!name) return false; // не идентификатор/вызов/литерал — не поняли, пропускаем
  return resolveNameHasFont(name, fileKey, files, depth - 1, canHop);
}

function resolveNameHasFont(name, fileKey, files, depth, canHop) {
  if (depth <= 0) return false;
  const src = files[fileKey];
  if (src === undefined) return false;
  const decl = findDeclarationExpr(name, maskLiterals(src));
  if (decl !== null) return exprHasFont(decl, fileKey, files, depth - 1, canHop);
  if (!canHop) return false;
  const importedFrom = findRelativeImportSource(name, src, fileKey, files);
  return importedFrom
    ? resolveNameHasFont(name, importedFrom, files, depth - 1, false)
    : false;
}

/** Находки по карте файлов `{ 'путь': 'исходник' }`: каждый input/textarea/select,
 * чьё выражение стиля объявляет `font`/`fontSize` напрямую или через резолвер. */
export function findInlineControlFontFindings(files) {
  const findings = [];
  for (const [fileKey, src] of Object.entries(files)) {
    const masked = maskLiterals(src);
    for (const { tag, line, expr } of findControlStyleExprs(src, masked)) {
      if (exprHasFont(expr, fileKey, files, MAX_DEPTH, true)) {
        const style = expr.trim().startsWith('{') ? 'инлайн-объект' : expr.trim();
        findings.push({ file: fileKey, line, tag, style });
      }
    }
  }
  return findings;
}

/** true, если в `css` есть правило, чьи селекторы покрывают `input`, `textarea`
 * и `select`, и в нём `font-size` ≥16px (docs/adr/0109). Комментарии выброшены
 * заранее — иначе те же слова в тексте комментария сошли бы за правило. */
export function hasControlFontSizeRule(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(stripped))) {
    const selectors = m[1].split(',').map((s) => s.trim());
    const coversAll = ['input', 'textarea', 'select'].every((t) => selectors.includes(t));
    if (!coversAll) continue;
    const sizeMatch = /font-size\s*:\s*([\d.]+)px/.exec(m[2]);
    if (sizeMatch && Number(sizeMatch[1]) >= 16) return true;
  }
  return false;
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
      if (!/\.tsx?$/.test(p) || p.includes('.test.')) continue;
      yield p;
    }
  }

  const files = {};
  for (const file of walk(SRC)) files[relative(ROOT, file)] = readFileSync(file, 'utf8');

  const findings = findInlineControlFontFindings(files);
  const cssOk = hasControlFontSizeRule(readFileSync(join(SRC, 'index.css'), 'utf8'));

  if (!cssOk) {
    console.error(
      '❌ index.css: нет правила `input, textarea, select { font-size: … }` с кеглем ' +
        '≥16px — без него Safari на iPhone зумит страницу при фокусе в поле и не ' +
        'возвращает масштаб (отзыв владельца 2026-09-22, ADR-0109).',
    );
  }
  for (const { file, line, tag, style } of findings) {
    console.error(`❌ инлайн-шрифт: ${file}:${line} <${tag}> style=${style}`);
  }
  if (findings.length > 0) {
    console.error(
      'Инлайн `font`/`fontSize` на контроле сильнее правила из index.css и вернёт ' +
        'зум на iPhone (ADR-0109). Убери размер шрифта из объекта стиля.',
    );
  }

  if (!cssOk || findings.length > 0) process.exit(1);
  console.log(
    `✓ кегль контролов держит index.css: ${Object.keys(files).length} файлов проверено, ` +
      'инлайн-шрифта нет',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
