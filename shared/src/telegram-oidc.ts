// Вход через Telegram по OpenID Connect (ADR-0187, SECURITY §2) — общий
// контракт api и web. Поток тот же, что у Google (ADR-0145): кнопка ведёт на
// `GET /api/auth/telegram/oidc/start`, сервер ставит httpOnly cookie с
// `state` и `code_verifier` и отправляет вкладку на oauth.telegram.org;
// Telegram возвращает её на `/login/telegram?code=…&state=…`, а страница шлёт
// пару POST-ом. Прежний переход с `return_to` и `#tgAuthResult` (ADR-0028)
// Telegram больше не доводит до конца: уже вошедшему в Telegram после
// подтверждения страница закрывается сама (стейджинг, 2026-10-22).
import { GOOGLE_OAUTH_CODE_RE, GOOGLE_OAUTH_STATE_RE } from './google-login';

/** Адрес, с которого начинается вход: браузер переходит на него целой
 * вкладкой (не `apiFetch`) — ответ сервера 302 на oauth.telegram.org. Код
 * ссылки-приглашения едет query-параметром `join` (`INVITE_QUERY_PARAM`). */
export const TELEGRAM_OIDC_START_PATH = '/api/auth/telegram/oidc/start';

/** Страница, на которую Telegram возвращает вкладку, — она же хвост
 * `redirect_uri` (`${PUBLIC_URL}${TELEGRAM_LOGIN_CALLBACK_PATH}`). Этот адрес
 * записан в BotFather («Login Widget» → «Allowed URLs», RUNBOOK §5): другой
 * Telegram не примет. */
export const TELEGRAM_LOGIN_CALLBACK_PATH = '/login/telegram';

/** Тело `POST /auth/telegram/oidc` (`@Public()`): что Telegram вернул в адресе. */
export interface TelegramOidcLoginInput {
  code: string;
  state: string;
}

/** `state` выпускает тот же генератор, что у Google (`randomBytes(32)` в
 * base64url, 43 знака), — и формат один. */
export const TELEGRAM_OIDC_STATE_RE = GOOGLE_OAUTH_STATE_RE;

/** Код авторизации Telegram — непрозрачная строка; формат Telegram не
 * обещает, поэтому та же граница, что у кода Google. */
export const TELEGRAM_OIDC_CODE_RE = GOOGLE_OAUTH_CODE_RE;

/** Один текст на «cookie нет», «state не совпал», «Telegram не отдал
 * токен», «токен не прошёл проверку» (SECURITY §2): человеку помогает одно и
 * то же — начать заново. */
export const TELEGRAM_LOGIN_FAILED_MESSAGE =
  'Не получилось войти через Telegram. Нажмите «Войти через Telegram» ещё раз.';

export const TELEGRAM_OIDC_NOT_AVAILABLE_MESSAGE =
  'Вход через Telegram пока не подключён. Попросите администратора включить его.';
