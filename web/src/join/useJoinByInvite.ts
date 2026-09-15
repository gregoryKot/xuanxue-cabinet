// Логика экрана `/join/:code` (ADR-0030) — вынесена из JoinScreen.tsx
// (CLAUDE.md «Логика вне компонентов»). Два шага: сначала проверить код без
// входа (`POST /auth/join/check`, `@Public()`) — страница не должна гнать
// человека логиниться зря на мёртвую ссылку; затем, как только появляется
// сессия (уже была или только что вошёл через Telegram/email), одноразово
// зовёт `POST /auth/join` сама, без отдельной кнопки — что вошедший видит
// эту ссылку, уже значит «присоединиться».
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CheckInviteResultDto } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';
import { useAuth } from '../auth/AuthProvider';

type CheckStatus = 'loading' | 'valid' | 'invalid' | 'offline';

export interface UseJoinByInviteResult {
  checkStatus: CheckStatus;
  /** true между стартом POST /auth/join и его ответом — отдельно от
   * `checkStatus`, потому что join() запускается уже после проверки. */
  joining: boolean;
  error: string | null;
  /** Повтор после сбоя — та же функция, что и авто-вызов при входе. */
  join: () => void;
  /** Повторить POST /auth/join/check после сетевого сбоя (checkStatus === 'offline'). */
  retryCheck: () => void;
}

export function useJoinByInvite(code: string): UseJoinByInviteResult {
  const { status: authStatus, refresh } = useAuth();
  const navigate = useNavigate();
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('loading');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const [checkAttempt, setCheckAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCheckStatus('loading');
    apiFetch<CheckInviteResultDto>('/auth/join/check', { method: 'POST', body: { code } })
      .then((res) => {
        if (!cancelled) setCheckStatus(res.valid ? 'valid' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setCheckStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [code, checkAttempt]);

  const join = useCallback(() => {
    // Гвард на выполнение, не на UI: повторный вызов (эффект ниже + ручная
    // кнопка «Повторить» после сбоя) не должен слать второй параллельный
    // POST — сбрасывается в catch, чтобы «Повторить» реально повторял.
    if (startedRef.current) return;
    startedRef.current = true;
    setJoining(true);
    setError(null);
    apiFetch<void>('/auth/join', { method: 'POST', body: { code } })
      .then(() => refresh())
      .then(() => navigate('/schedule', { replace: true }))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        startedRef.current = false;
      })
      .finally(() => setJoining(false));
  }, [code, refresh, navigate]);

  // Сессия уже есть (обычный вход по ссылке, включая active-человека,
  // который просто открыл её снова) или только что появилась (Telegram-
  // возврат на этот же URL, TelegramLoginSection.tsx с navigateAfterLogin:
  // false) — присоединяем сразу, без отдельного клика.
  useEffect(() => {
    if (checkStatus === 'valid' && authStatus === 'ok') join();
  }, [checkStatus, authStatus, join]);

  return {
    checkStatus,
    joining,
    error,
    join,
    retryCheck: () => setCheckAttempt((n) => n + 1),
  };
}
