#!/usr/bin/env node
// Один сканер исходника на все гейты-храповики: убирает из текста то, что
// не является кодом, — комментарии и содержимое строковых литералов.
//
// Зачем отдельный модуль. Гейты ищут в исходнике по тексту (регулярками, а
// не разбором TS — см. шапку check-route-collisions.mjs), и каждый из них
// натыкается на одно и то же: комментарий или строка выглядят как код.
// Аудит 2026-09-22 нашёл этому живой пример: комментарий в
// api/src/auth/join.controller.ts, который объяснял гейт и буквально
// содержал `@Controller()`, подменял парсеру настоящий префикс `auth` на
// пустой — гейт коллизий считал маршрут `POST /join/check` вместо
// `POST /auth/join/check` и молча перестал сторожить эти пути.
//
// Замена идёт пробелами ТОЙ ЖЕ ДЛИНЫ и не трогает переводы строк: смещения
// и номера строк в очищенном тексте совпадают с исходными, поэтому находку
// можно сразу показать человеку с номером строки оригинала.
//
// Три копии такого сканера в трёх гейтах поймал бы jscpd-храповик, а
// разъехались бы они молча — поэтому он здесь один.

const QUOTES = new Set(["'", '"', '`']);

/** Пробелы той же длины: перевод строки сохраняется, остальное гасится. */
function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

/** Тело литерала, открытого кавычкой в позиции `start`, без самих кавычек.
 * Экранирование (`\'`, `\\`) пропускается парой. Незакрытый литерал
 * (оборванный файл) читается до конца — падать на этом гейту незачем. */
function readLiteralBody(src, start, quote) {
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) break;
    i += 1;
  }
  return src.slice(start + 1, Math.min(i, src.length));
}

/** Общий проход по исходнику. `strings: true` гасит и содержимое строковых
 * литералов, `false` — только комментарии; сами кавычки остаются на месте в
 * обоих случаях, иначе `@Controller('x')` перестал бы разбираться.
 * Подстановка `${…}` внутри шаблона гасится вместе с телом литерала: коду
 * внутри неё гейты вопросов не задают. */
function scan(src, { strings }) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out.push(blank(src.slice(i, stop)));
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out.push(blank(src.slice(i, stop)));
      i = stop;
      continue;
    }
    if (QUOTES.has(ch)) {
      const body = readLiteralBody(src, i, ch);
      out.push(ch, strings ? blank(body) : body);
      i += 1 + body.length;
      if (src[i] === ch) {
        out.push(ch);
        i += 1;
      }
      continue;
    }

    out.push(ch);
    i += 1;
  }
  return out.join('');
}

/** Текст без комментариев. Кавычки и содержимое строк остаются: парсеру
 * `@Controller('auth')` нужен аргумент целиком. */
export function stripComments(src) {
  return scan(src, { strings: false });
}

/** Текст без комментариев и без содержимого строковых литералов. Годится
 * для поиска вызовов и сопоставления скобок: `it('текст со скобкой (')` и
 * `fetch(\`${base}/a?b=(c)\`)` перестают ломать баланс. */
export function stripLiterals(src) {
  return scan(src, { strings: true });
}
