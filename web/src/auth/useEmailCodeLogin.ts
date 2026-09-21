// Вход по коду из письма (ADR-0104) — второй способ потратить ту же заявку
// на вход, что и ссылка (useEmailLoginVerify.ts). Причина: приложение,
// поставленное на домашний экран айфона, держит свои cookie отдельно от
// Safari, а ссылка из письма всегда открывается в браузере — сессия
// доставалась ему, а приложение оставалось не вошедшим без выхода из этого.
// Код человек переносит руками в то самое окно, которое письмо и запросило.
//
// Отличие от useEmailLoginVerify.ts (образец): там запрос стартует сам,
// эффектом, как только страница открылась по ссылке — нужен startedRef
// против двойного вызова эффекта в React 19 StrictMode. Здесь запрос
// запускает человек нажатием кнопки, а не эффект при открытии страницы:
// вызовов ровно столько, сколько нажатий, и флаг «уже стартовал» не нужен.
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VerifyEmailCodeInput } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';
import { postLoginPath } from './returnTo';

type EmailCodeLoginStatus = 'idle' | 'pending' | 'error';

export interface UseEmailCodeLoginResult {
  status: EmailCodeLoginStatus;
  error: string | null;
  submit: (email: string, code: string) => Promise<void>;
}

/** `refresh` — параметром, не через useAuth() внутри хука (тот же приём, что
 * useEmailLoginVerify.ts и useEmailLink.ts): так хук проверяется без
 * <AuthProvider> в дереве, а вызывающий компонент сам решает, откуда его
 * взять. `inviteCode` — код ссылки-приглашения школы (ADR-0030/0036), как и
 * у входа по ссылке: без него новый человек в кабинет не попадает. */
export function useEmailCodeLogin(
  refresh: () => Promise<void>,
  inviteCode?: string,
): UseEmailCodeLoginResult {
  const navigate = useNavigate();
  const [status, setStatus] = useState<EmailCodeLoginStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (email: string, code: string) => {
      setStatus('pending');
      setError(null);
      const body: VerifyEmailCodeInput = inviteCode
        ? { email, code, inviteCode }
        : { email, code };
      try {
        await apiFetch<void>('/auth/email/code', { method: 'POST', body });
        await refresh();
        void navigate(postLoginPath(), { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
      }
    },
    [inviteCode, refresh, navigate],
  );

  return { status, error, submit };
}
