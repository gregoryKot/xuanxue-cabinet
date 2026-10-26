// Куда уводит кнопка «Войти через Telegram» (TelegramLoginSection.tsx) и когда
// она стоит «занятой». Два пути, пока на каждом окружении не заведён секрет из
// BotFather (`AuthConfigDto.telegramOidcEnabled`, ADR-0187):
//  - включён OpenID Connect — вкладка идёт на сервер, он 302-ит на
//    oauth.telegram.org с `state` и PKCE; Telegram вернёт её на
//    `/login/telegram?code=…&state=…` (TelegramLoginCallbackScreen.tsx). Так же
//    устроен вход через Google (googleAuthRedirect.ts);
//  - выключен — прежний переход с `return_to` и `#tgAuthResult` (ADR-0028):
//    Telegram после подтверждения закрывает страницу, не возвращая вкладку
//    (стейджинг, 2026-10-22), но без секрета другого пути нет. Ветка и весь
//    её хвост (telegramAuthRedirect.ts, useTelegramAuthResultLogin.ts)
//    удаляются целиком, когда секрет стоит везде.
import { TELEGRAM_OIDC_START_PATH, type AuthConfigDto } from '@xuanxue/shared';
import { loginStartUrl } from './loginStartUrl';
import { redirectCurrentTab, redirectToTelegramAuth } from './telegramAuthRedirect';
import { useLeavePending } from './useLeavePending';

/** `inviteCode` — код ссылки-приглашения (ADR-0030/0036): OIDC несёт его в
 * адресе старта, прежний путь — нет, он вернёт вкладку на тот же `/join/:code`
 * сам. `start` не делает ничего, пока в конфигурации нет бота (кнопки в этот
 * момент на экране нет), и не занимает кнопку, если уводить некуда. */
export function useTelegramLoginStart(
  config: AuthConfigDto | null,
  inviteCode?: string,
): [pending: boolean, start: () => void] {
  const [pending, markLeaving] = useLeavePending();

  function start(): void {
    if (config?.telegramOidcEnabled) {
      markLeaving();
      redirectCurrentTab(loginStartUrl(TELEGRAM_OIDC_START_PATH, inviteCode));
      return;
    }
    if (!config?.telegramBotId) return;
    markLeaving();
    redirectToTelegramAuth(config.telegramBotId);
  }

  return [pending, start];
}
