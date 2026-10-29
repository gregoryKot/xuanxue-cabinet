// Адрес авторизации Telegram (`oauth.telegram.org/auth`), на который
// TelegramOidcController.start() переводит вкладку (ADR-0187) — чистая
// функция, как buildGoogleAuthUrl.
//
// `nonce` не шлём: в документации Telegram для запроса по адресу его нет
// (только в JS-библиотеке), а для Authorization Code Flow он необязателен —
// OIDC Core §3.1.2.1. Подмену ответа закрывают `state` из httpOnly cookie,
// PKCE (verifier знает только наш сервер) и то, что id_token приходит серверу
// напрямую от token endpoint по TLS в обмен на client_secret (telegram-oidc-id-token.ts).
import type { TelegramOidcConfig } from './telegram-oidc-config';

const TELEGRAM_AUTH_ENDPOINT = 'https://oauth.telegram.org/auth';
// openid + profile — claim `id` (ключ входа) и имя; telegram:bot_access — то,
// что раньше давал `request_access=write`: бот может писать человеку (личный
// чат для напоминаний). `phone` не просим: телефон кабинету не нужен
// (CLAUDE.md «Персональные данные — минимум»).
const TELEGRAM_SCOPE = 'openid profile telegram:bot_access';

export interface TelegramAuthUrlParams {
  state: string;
  challenge: string;
}

export function buildTelegramAuthUrl(
  config: TelegramOidcConfig,
  { state, challenge }: TelegramAuthUrlParams,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: TELEGRAM_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // Документация Telegram про `origin` в адресной форме молчит, а сервер без
    // него отвечает 200 «origin required» (проверено вживую 2026-10-29): первый
    // же переход по кнопке вёл бы на пустую страницу с этим текстом.
    origin: config.origin,
  });
  // Пробелы в scope — %20, как в примере документации Telegram, а не «+» от
  // URLSearchParams: настоящий «+» параметры кодируют как %2B, замена безопасна.
  return `${TELEGRAM_AUTH_ENDPOINT}?${params.toString().replace(/\+/g, '%20')}`;
}
