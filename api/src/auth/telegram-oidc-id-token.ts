// Разбор и проверка id_token, который Telegram вернул из token endpoint
// (ADR-0187) — БЕЗ проверки подписи, по тем же основаниям, что у Google
// (google-id-token.ts, ADR-0145): токен получен НАШИМ сервером напрямую от
// oauth.telegram.org по TLS в обмен на client_secret и code_verifier PKCE
// (TelegramOidcTokenClient). OpenID Connect Core 1.0 §3.1.3.7 «ID Token
// Validation», пункт 6, для Authorization Code Flow разрешает опереться на
// проверку TLS-сервера вместо подписи. Документация Telegram советует
// проверять подпись по JWKS — это про клиентов, которым токен приходит
// окольным путём; держать JWKS и его ротацию ради канала, который уже
// защищён секретом клиента, — лишняя поверхность без пользы.
//
// Ключ входа — claim `id` (числовой Telegram ID, тот же, что был в виджете и
// лежит в `users.telegramId`), а не `sub`: `sub` у Telegram непрозрачный и с
// Telegram ID не связан, по нему существующих людей не найти.
//
// Чистая функция без DI — юнит-тест без Nest и без сети (CLAUDE.md «Тесты»).
import type { DateTime } from 'luxon';
import { NEW_PERSON_NAME, joinPersonName } from '@xuanxue/shared';
import { decodeJwtPayload } from './jwt-payload';

const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
// Telegram держит имя и фамилию до 64 знаков каждое — тот же потолок, что был
// у DTO виджета (telegram-login.dto.ts); строка длиннее — не имя.
const NAME_PART_MAX_LENGTH = 64;
const NAME_MAX_LENGTH = NAME_PART_MAX_LENGTH * 2 + 1;
const NUMERIC_ID_RE = /^\d{1,16}$/;

export interface ParseTelegramIdTokenParams {
  /** Числовой id бота строкой — `aud` обязан называть именно его. */
  clientId: string;
  now: DateTime;
}

export interface TelegramOidcIdentity {
  /** Ключ входа — `users.telegramId`. */
  telegramId: number;
  /** Отображаемое имя: given+family, иначе `name`, иначе `preferred_username`,
   * иначе заглушка NEW_PERSON_NAME (экран `/welcome` спросит имя — тот же
   * путь, что у входа по почте и у Google без имени). */
  name: string;
}

/** Бросает `Error` с причиной в сообщении (пользователю не показывается —
 * TelegramOidcService ловит и отвечает одним TELEGRAM_LOGIN_FAILED_MESSAGE на
 * любую из веток, SECURITY §2). */
export function parseTelegramIdToken(
  idToken: string,
  { clientId, now }: ParseTelegramIdTokenParams,
): TelegramOidcIdentity {
  const claims = decodeJwtPayload(idToken);

  if (claims.iss !== TELEGRAM_ISSUER) {
    throw new Error('id_token: неизвестный iss');
  }
  if (!audienceMatches(claims.aud, clientId)) {
    throw new Error('id_token: aud не совпадает с client_id');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= now.toSeconds()) {
    throw new Error('id_token: истёк');
  }
  const telegramId = parseTelegramId(claims.id);
  if (telegramId === null) {
    throw new Error('id_token: нет claim id (нужен scope profile) или он не Telegram ID');
  }

  return { telegramId, name: displayName(claims) };
}

/** `aud` — строка с id бота; массив допускает спецификация OIDC (Telegram
 * сейчас шлёт строку), тогда в нём должен быть наш клиент. */
function audienceMatches(aud: unknown, clientId: string): boolean {
  if (typeof aud === 'string') return aud === clientId;
  return Array.isArray(aud) && aud.includes(clientId);
}

/** Положительное безопасное целое — числом или строкой из цифр (JSON-числа за
 * 2^53 теряют точность, поэтому строка допустима, а нецелое и нуль — нет). */
function parseTelegramId(raw: unknown): number | null {
  const value = typeof raw === 'string' && NUMERIC_ID_RE.test(raw) ? Number(raw) : raw;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function displayName(claims: Record<string, unknown>): string {
  const joined = joinPersonName(text(claims.given_name), text(claims.family_name));
  const name = joined || text(claims.name) || text(claims.preferred_username);
  return name.slice(0, NAME_MAX_LENGTH) || NEW_PERSON_NAME;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
