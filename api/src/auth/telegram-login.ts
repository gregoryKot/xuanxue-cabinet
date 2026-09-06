// Проверка подписи Telegram Login Widget (SECURITY §2, ADR-0005): чистая
// функция, без БД и без побочных эффектов — TelegramAuthService решает, в
// какую доменную ошибку превратить `false`.
//
// Алгоритм Telegram: data-check-string — ВСЕ поля сырого тела запроса, кроме
// hash, как `key=value`, отсортированные по ключу, через `\n`; ключ HMAC —
// sha256(BOT_TOKEN); подпись — HMAC-SHA256 hex. Считаем по сырому телу
// (`req.body`), не по типизированному DTO: ValidationPipe с `whitelist: true`
// строит DTO только из известных полей и отбрасывает остальные — набор полей
// DTO не совпадает с тем, что реально подписал Telegram, и лишнее поле от
// клиента сломало бы проверку. Сравнение — timingSafeEqual (длины буферов
// проверяем до вызова: сам timingSafeEqual иначе бросает исключение, а не
// возвращает false).
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { DateTime } from 'luxon';

/** Виджет действителен сутки — старее означает украденную или пересланную
 * ссылку с подписью (SECURITY §2). */
export const TELEGRAM_AUTH_MAX_AGE_SEC = 86400;

/** Формат `hash` — строка из 64 hex-символов (HMAC-SHA256 в hex). Используется
 * и здесь (проверка подписи по сырому телу), и в TelegramLoginDto (проверка
 * формы типизированного поля) — совпадение случайное: у DTO своя, независимая
 * от подписи, причина требовать этот формат (см. комментарий в dto). */
export const TELEGRAM_HASH_RE = /^[0-9a-f]{64}$/;

function dataCheckString(rawBody: Record<string, unknown>): string {
  return Object.entries(rawBody)
    .filter(([key, value]) => key !== 'hash' && value !== null && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
}

function expectedHash(rawBody: Record<string, unknown>, botToken: string): Buffer {
  const secretKey = createHash('sha256').update(botToken).digest();
  return createHmac('sha256', secretKey).update(dataCheckString(rawBody)).digest();
}

function isFreshEnough(authDateSec: number, now: DateTime): boolean {
  const ageSec = now.toSeconds() - authDateSec;
  // Отрицательный возраст (auth_date в будущем) — подпись из будущего,
  // такая же подозрительная, как протухшая: тоже отказ.
  return ageSec >= 0 && ageSec <= TELEGRAM_AUTH_MAX_AGE_SEC;
}

/** true — подпись верна и `auth_date` не старше `TELEGRAM_AUTH_MAX_AGE_SEC`
 * относительно `now`. Единственный узел проверки виджета в проекте — новый
 * путь входа с виджетом свою проверку не пишет.
 *
 * `rawBody` — сырое тело запроса (`req.body`), а не типизированный DTO: см.
 * комментарий вверху файла. */
export function isValidTelegramLogin(
  rawBody: Record<string, unknown>,
  botToken: string,
  now: DateTime,
): boolean {
  const hash = rawBody.hash;
  if (typeof hash !== 'string' || !TELEGRAM_HASH_RE.test(hash)) return false;

  const expected = expectedHash(rawBody, botToken);
  const actual = Buffer.from(hash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return false;
  }

  const authDate = rawBody.auth_date;
  return typeof authDate === 'number' && isFreshEnough(authDate, now);
}
