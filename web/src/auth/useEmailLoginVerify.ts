// Потребление токена входа по email — POST по нажатию кнопки, не при
// открытии страницы (SECURITY §2, ADR-0029): сканеры почтовых клиентов сами
// открывают ссылки из письма и молча сожгли бы одноразовый токен раньше
// пользователя. Логика вынесена из EmailLoginCallbackScreen.tsx (CLAUDE.md
// «Логика вне компонентов»), тот же приём, что useTelegramAuthResultLogin.ts:
// POST → refresh() сессии → сохранённый адрес или домашний экран
// (postLoginPath, аудит L2 — раньше жёстко /schedule). `joinCode`
// (ADR-0030/0034) едет прямо в теле verify — отдельного шага
// «присоединиться после входа» больше нет.
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';
import { postLoginPath } from './returnTo';

type EmailLoginVerifyStatus = 'idle' | 'pending' | 'error';

export interface UseEmailLoginVerifyResult {
  status: EmailLoginVerifyStatus;
  error: string | null;
  verify: (token: string) => Promise<void>;
}

export function useEmailLoginVerify(
  refresh: () => Promise<void>,
  joinCode?: string,
): UseEmailLoginVerifyResult {
  const navigate = useNavigate();
  const [status, setStatus] = useState<EmailLoginVerifyStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(
    async (token: string) => {
      setStatus('pending');
      setError(null);
      try {
        await apiFetch<void>('/auth/email/verify', {
          method: 'POST',
          body: joinCode ? { token, inviteCode: joinCode } : { token },
        });
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
        return;
      }
      setStatus('idle');
      void navigate(postLoginPath(), { replace: true });
    },
    [refresh, joinCode, navigate],
  );

  return { status, error, verify };
}
