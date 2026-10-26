// Страница возврата из Telegram (`TELEGRAM_LOGIN_CALLBACK_PATH`, ADR-0187) —
// Telegram возвращает сюда вкладку после входа по OpenID Connect, с `?code=…&state=…`
// или с `?error=…`, когда человек отказал. Что делает страница и как — в
// ProviderCallbackScreen.tsx (то же, что у Google); здесь только то, что знает
// о себе Telegram. Прежний возврат на `/login#tgAuthResult=` (ADR-0028) живёт
// отдельно, в useTelegramAuthResultLogin.ts, пока он не удалён.
import { TELEGRAM_OIDC_CODE_RE, TELEGRAM_OIDC_STATE_RE } from '@xuanxue/shared';
import { ProviderCallbackScreen, type ProviderCallback } from './ProviderCallbackScreen';

const TELEGRAM_CALLBACK: ProviderCallback = {
  codePattern: TELEGRAM_OIDC_CODE_RE,
  statePattern: TELEGRAM_OIDC_STATE_RE,
  buildRequest: (code, state) => ({
    key: 'POST /auth/telegram/oidc',
    body: { code, state },
  }),
  cancelledMessage: 'Вы вернулись из Telegram, не подтвердив вход. Попробуйте ещё раз.',
  incompleteLinkMessage: 'Ссылка не подошла. Начните вход через Telegram заново.',
};

export default function TelegramLoginCallbackScreen() {
  return <ProviderCallbackScreen provider={TELEGRAM_CALLBACK} />;
}
