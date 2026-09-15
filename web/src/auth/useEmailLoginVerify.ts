// Потребление токена входа по email — POST по нажатию кнопки, не при
// открытии страницы (SECURITY §2, ADR-0029): сканеры почтовых клиентов сами
// открывают ссылки из письма и молча сожгли бы одноразовый токен раньше
// пользователя. Логика вынесена из EmailLoginCallbackScreen.tsx (CLAUDE.md
// «Логика вне компонентов»), тот же приём, что useTelegramAuthResultLogin.ts:
// POST → refresh() сессии → сохранённый адрес или домашний экран
// (postLoginPath, аудит L2 — раньше жёстко /schedule).
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';
import { postLoginPath } from './returnTo';

type EmailLoginVerifyStatus = 'idle' | 'pending' | 'error';

export interface UseEmailLoginVerifyResult {
  status: EmailLoginVerifyStatus;
  error: string | null;
  /** Ошибка `POST /auth/join` после успешного verify (ADR-0030, `join` из
   * query `/login/email?...&join=<code>`) — вход уже состоялся (сессия
   * есть), сама ошибка не блокирует его: человек остаётся тем, кем был
   * (`invited`/`active`), а не подвисает без обратной связи. */
  joinError: string | null;
  verify: (token: string) => Promise<void>;
  /** Кнопка «Перейти в кабинет» под joinError — тот же переход, что случился
   * бы сам, если бы `POST /auth/join` не упал. */
  continueToSchedule: () => void;
}

export function useEmailLoginVerify(
  refresh: () => Promise<void>,
  joinCode?: string,
): UseEmailLoginVerifyResult {
  const navigate = useNavigate();
  const [status, setStatus] = useState<EmailLoginVerifyStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const continueToSchedule = useCallback(() => {
    void navigate(postLoginPath(), { replace: true });
  }, [navigate]);

  const verify = useCallback(
    async (token: string) => {
      setStatus('pending');
      setError(null);
      setJoinError(null);
      try {
        await apiFetch<void>('/auth/email/verify', { method: 'POST', body: { token } });
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
        return;
      }
      setStatus('idle');
      if (!joinCode) {
        continueToSchedule();
        return;
      }
      try {
        await apiFetch<void>('/auth/join', { method: 'POST', body: { code: joinCode } });
        continueToSchedule();
      } catch (err) {
        setJoinError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
      }
    },
    [refresh, joinCode, continueToSchedule],
  );

  return { status, error, joinError, verify, continueToSchedule };
}
