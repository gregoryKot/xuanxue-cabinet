// Вход через Google — как Telegram (telegramAuthRedirect.ts), переход текущей
// вкладки, не попап и не `apiFetch`: сервер отвечает на `GOOGLE_LOGIN_START_PATH`
// httpOnly-cookie и 302 в Google (`shared/src/google-login.ts`, ADR-0145). Код
// ссылки-приглашения едет тем же query-параметром, что у Telegram
// (`INVITE_QUERY_PARAM`, ADR-0030) — сервер кладёт его в cookie состояния и
// возвращает на `/login/google` вместе с ним же.
//
// Привязка Google уже вошедшему («Профиль», ADR-0145) — тот же адрес и тот
// же переход, с `intent=link` (`GOOGLE_INTENT_QUERY_PARAM`): сервер кладёт
// намерение в ту же cookie состояния, страница возврата (`/login/google`)
// одна на оба случая, решает сервер, не адрес. `saveReturnTo('/profile')`
// перед уходом — тем же приёмом, что RequireAuth.tsx перед `/login»: страница
// возврата не знает про привязку сама, читает сохранённый путь, как обычно.
import {
  GOOGLE_INTENT_QUERY_PARAM,
  GOOGLE_LINK_INTENT,
  GOOGLE_LOGIN_START_PATH,
  INVITE_QUERY_PARAM,
} from '@xuanxue/shared';
import { redirectCurrentTab } from './telegramAuthRedirect';
import { saveReturnTo } from './returnTo';

const PROFILE_PATH = '/profile';

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

/** Адрес привязки — тот же старт с `intent=link`, без кода приглашения:
 * привязывает уже вошедшего, приглашать в школу нечего. */
export function googleLinkStartUrl(): string {
  return `${GOOGLE_LOGIN_START_PATH}?${GOOGLE_INTENT_QUERY_PARAM}=${GOOGLE_LINK_INTENT}`;
}

/** Переход текущей вкладки на привязку Google из «Профиля» — сохраняет путь
 * возврата первым делом, до самого перехода (то же место в потоке, что и
 * `saveReturnTo` перед уходом в Telegram у RequireAuth.tsx). */
export function redirectToGoogleLink(): void {
  saveReturnTo(PROFILE_PATH);
  redirectCurrentTab(googleLinkStartUrl());
}
