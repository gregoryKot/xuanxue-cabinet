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
import type { MeDto, VerifyEmailCodeInput } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';
import { postLoginPath } from './returnTo';

type EmailCodeLoginStatus = 'idle' | 'pending' | 'error';

export interface UseEmailCodeLoginResult {
  status: EmailCodeLoginStatus;
  error: string | null;
  submit: (email: string, code: string) => Promise<void>;
}

/** `applyMe`, а не `refresh` (ADR-0087): эндпоинт отвечает тем же `MeDto`,
 * что и `GET /auth/me`, — перечитывать профиль вторым запросом не за чем,
 * свежее состояние уже в ответе записи (гейт `check-write-then-reload.mjs`).
 * Параметром, не через useAuth() внутри хука (тот же приём, что
 * useEmailLoginVerify.ts и useEmailLink.ts): так хук проверяется без
 * <AuthProvider> в дереве, а вызывающий компонент сам решает, откуда его
 * взять. `inviteCode` — код ссылки-приглашения школы (ADR-0030/0036), как и
 * у входа по ссылке: без него новый человек в кабинет не попадает. */
export function useEmailCodeLogin(
  applyMe: (me: MeDto) => void,
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
        const me = await apiFetch<MeDto>('/auth/email/code', { method: 'POST', body });
        applyMe(me);
        void navigate(postLoginPath(), { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
      }
    },
    [inviteCode, applyMe, navigate],
  );

  return { status, error, submit };
}
