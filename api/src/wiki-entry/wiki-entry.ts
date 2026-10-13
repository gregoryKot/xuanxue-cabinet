// Чистая часть входа из wiki (ADR-0183, контракт Workshop web-wiki-session):
// разбор `returnTo`, адрес экрана входа и вид исхода. Без Nest и без базы —
// тесты идут на строках. Адрес назначения — единственное, что приходит от
// чужой страницы, и от него зависит, куда кабинет отправит браузер с общей
// cookie, поэтому правило строгое: только относительный путь на wiki окружения,
// любое сомнение — отказ, а не «почини и пропусти».

export type WikiEntryPageKey = 'invalid' | 'blocked' | 'unavailable';

export type WikiEntryOutcome =
  | { kind: 'page'; page: WikiEntryPageKey; status: number }
  | { kind: 'redirect'; location: string; cookies?: string[] };

export type WikiReturnTo =
  | {
      ok: true;
      /** Раскодированный путь на wiki — для адреса экрана входа. */
      destination: string;
      /** Абсолютный адрес на wiki — для `Location`. */
      location: string;
    }
  | { ok: false };

const RETURN_TO_FIELD = 'returnTo';
const DEFAULT_DESTINATION = '/';
/** Потолок длины раскодированного пути в байтах UTF-8 (контракт). */
const MAX_DESTINATION_BYTES = 1024;
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;
const REFUSED: WikiReturnTo = { ok: false };

/** Форма `application/x-www-form-urlencoded`: `+` — пробел. `null` при битом
 * процентном кодировании. */
function decodeFormValue(raw: string): string | null {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

/** Единственное значение `returnTo` из непустой сырой строки запроса: чужие
 * поля, повтор и часть без `=` — `null` (отказ), а не «берём первое». */
function rawReturnTo(rawQuery: string): string | null {
  let found: string | null = null;
  for (const part of rawQuery.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq) !== RETURN_TO_FIELD || found !== null) {
      return null;
    }
    found = part.slice(eq + 1);
  }
  return found;
}

// U+0000–U+001F и U+007F: в заголовке `Location` и в адресе им не место.
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= LAST_CONTROL_CODE || code === DELETE_CODE) return true;
  }
  return false;
}

function isAllowedDestination(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\') || hasControlCharacter(value)) return false;
  return Buffer.byteLength(value, 'utf8') <= MAX_DESTINATION_BYTES;
}

/** Адрес на wiki или `null`, если путь ушёл с её origin. Сверка после разбора —
 * страховка от всего, что проверки выше не предусмотрели. */
function resolveOnWiki(destination: string, wikiOrigin: string): string | null {
  try {
    const url = new URL(destination, wikiOrigin);
    return url.origin === wikiOrigin ? url.href : null;
  } catch {
    return null;
  }
}

/** `rawQuery` — часть адреса после первого `?`, как пришла: разбор Express
 * (`req.query`) склеил бы повторы в массив и сам раскодировал бы значения. */
export function parseWikiReturnTo(
  rawQuery: string | undefined,
  wikiOrigin: string,
): WikiReturnTo {
  const raw = rawQuery ? rawReturnTo(rawQuery) : DEFAULT_DESTINATION;
  const destination = raw === null ? null : decodeFormValue(raw);
  if (destination === null || !isAllowedDestination(destination)) return REFUSED;
  const location = resolveOnWiki(destination, wikiOrigin);
  return location ? { ok: true, destination, location } : REFUSED;
}

/** Экран входа кабинета с возвратом на этот же маршрут: после входа браузер
 * приходит на `/wiki?returnTo=…` ещё раз и уже с сессией. */
export function wikiLoginPath(destination: string): string {
  const back = `/wiki?returnTo=${encodeURIComponent(destination)}`;
  return `/login?returnTo=${encodeURIComponent(back)}`;
}
