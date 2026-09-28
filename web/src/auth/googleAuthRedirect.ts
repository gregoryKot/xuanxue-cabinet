// Вход через Google — как Telegram (telegramAuthRedirect.ts), переход текущей
// вкладки, не попап и не `apiFetch`: сервер отвечает на `GOOGLE_LOGIN_START_PATH`
// httpOnly-cookie и 302 в Google (`shared/src/google-login.ts`, ADR-0145). Код
// ссылки-приглашения едет тем же query-параметром, что у Telegram
// (`INVITE_QUERY_PARAM`, ADR-0030) — сервер кладёт его в cookie состояния и
// возвращает на `/login/google` вместе с ним же.
import { GOOGLE_LOGIN_START_PATH, INVITE_QUERY_PARAM } from '@xuanxue/shared';
import { redirectCurrentTab } from './telegramAuthRedirect';

/** Адрес перехода на `GOOGLE_LOGIN_START_PATH` — чистая функция, свой тест
 * (googleAuthRedirect.test.ts), без обращения к `window`. */
export function googleLoginStartUrl(inviteCode?: string): string {
  const query = inviteCode
    ? `?${INVITE_QUERY_PARAM}=${encodeURIComponent(inviteCode)}`
    : '';
  return `${GOOGLE_LOGIN_START_PATH}${query}`;
}

/** Переход текущей вкладки на сервер (не на Google напрямую: сервер сам
 * ставит cookie состояния и 302-ит дальше) — та же функция перехода, что у
 * `redirectToTelegramAuth` (telegramAuthRedirect.ts, CLAUDE.md «Одна
 * механика — один компонент»: второго способа увести вкладку не заводим). */
export function redirectToGoogleAuth(inviteCode?: string): void {
  redirectCurrentTab(googleLoginStartUrl(inviteCode));
}
