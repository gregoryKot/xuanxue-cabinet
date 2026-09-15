// Потребление токена входа по email — POST по нажатию кнопки, не при
// открытии страницы (SECURITY §2, ADR-0029): сканеры почтовых клиентов сами
// открывают ссылки из письма и молча сожгли бы одноразовый токен раньше
// пользователя. Логика вынесена из EmailLoginCallbackScreen.tsx (CLAUDE.md
// «Логика вне компонентов»), тот же приём, что useTelegramAuthResultLogin.ts:
// POST → refresh() сессии → переход на /schedule.
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

type EmailLoginVerifyStatus = 'idle' | 'pending' | 'error';

export interface UseEmailLoginVerifyResult {
  status: EmailLoginVerifyStatus;
  error: string | null;
  verify: (token: string) => Promise<void>;
}

export function useEmailLoginVerify(
  refresh: () => Promise<void>,
): UseEmailLoginVerifyResult {
  const navigate = useNavigate();
  const [status, setStatus] = useState<EmailLoginVerifyStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(
    async (token: string) => {
      setStatus('pending');
      setError(null);
      try {
        await apiFetch<void>('/auth/email/verify', { method: 'POST', body: { token } });
        await refresh();
        void navigate('/schedule', { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
      }
    },
    [refresh, navigate],
  );

  return { status, error, verify };
}
