// Страница возврата из Google (`GOOGLE_LOGIN_CALLBACK_PATH`, ADR-0145) — одна
// на два случая, вход и привязка (`intent=link`, googleAuthRedirect.ts):
// сервер решает, что это было, по своей cookie состояния, страница всегда
// просто шлёт {code, state}. Всё общее с возвратом из Telegram — в
// ProviderCallbackScreen.tsx; здесь только то, что знает о себе Google.
// Отменённый человеком выбор аккаунта возвращает `?error=access_denied`
// (возможны и другие значения `error`) — сервер тогда вообще не звался,
// отменённое нечем проверять.
import { GOOGLE_OAUTH_CODE_RE, GOOGLE_OAUTH_STATE_RE } from '@xuanxue/shared';
import { ProviderCallbackScreen, type ProviderCallback } from './ProviderCallbackScreen';

const GOOGLE_CALLBACK: ProviderCallback = {
  codePattern: GOOGLE_OAUTH_CODE_RE,
  statePattern: GOOGLE_OAUTH_STATE_RE,
  buildRequest: (code, state) => ({ key: 'POST /auth/google', body: { code, state } }),
  cancelledMessage: 'Вы вернулись из Google, не выбрав аккаунт. Попробуйте ещё раз.',
  incompleteLinkMessage: 'Ссылка не подошла. Начните вход через Google заново.',
};

export default function GoogleLoginCallbackScreen() {
  return <ProviderCallbackScreen provider={GOOGLE_CALLBACK} />;
}
