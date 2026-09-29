// Потребление токена входа по email — тонкая обёртка над общим механизмом
// callback-входа (useCallbackLogin.ts, ADR-0044, тот же приём, что у
// Google-входа, GoogleLoginCallbackScreen.tsx): собирает тело
// `POST /auth/email/verify` из токена и кода приглашения (ADR-0030/0036),
// остальное — startedRef, refresh(), переход на postLoginPath() — общее.
import {
  useCallbackLogin,
  type CallbackLoginRequest,
  type UseCallbackLoginResult,
} from './useCallbackLogin';

export type UseEmailLoginVerifyResult = UseCallbackLoginResult;

/**
 * `token: null` — сигнал экрана не запускать verify вовсе: ссылка неполная
 * или сессия уже есть (EmailLoginCallbackScreen.tsx решает это по
 * `hasSession(authStatus)`, дожидаясь ответа AuthProvider, чтобы не
 * отправить токен на сервер тем же тиком, что и проверку существующей
 * сессии). Как только `token` становится непустым, verify запускается.
 */
export function useEmailLoginVerify(
  refresh: () => Promise<void>,
  token: string | null,
  joinCode?: string,
): UseEmailLoginVerifyResult {
  const request: CallbackLoginRequest | null =
    token === null
      ? null
      : {
          key: 'POST /auth/email/verify',
          body: joinCode ? { token, inviteCode: joinCode } : { token },
        };
  return useCallbackLogin(refresh, request);
}
