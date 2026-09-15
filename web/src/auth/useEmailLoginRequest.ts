// Запрос ссылки для входа по почте (ADR-0029) — логика вынесена из формы
// (CLAUDE.md «Логика вне компонентов»): EmailLoginForm.tsx только рендерит
// по `status`/`sentOnce`. Сервер всегда отвечает 204 (SECURITY §2 —
// существование email не раскрывается), поэтому 'error' здесь бывает лишь
// от сети или 503 «Email-вход не подключён» (гонка с конфигурацией, редкий
// случай — LoginScreen.tsx уже прячет форму, пока `emailLoginEnabled` false).
import { useCallback, useRef, useState } from 'react';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

type EmailLoginRequestStatus = 'idle' | 'pending' | 'sent' | 'error';

export interface UseEmailLoginRequestResult {
  status: EmailLoginRequestStatus;
  error: string | null;
  /** true — хоть один запрос уже завершился успехом. Не сбрасывается
   * повторным сбоем «Отправить ещё раз» — форма не должна возвращаться
   * после того, как письмо один раз ушло. */
  sentOnce: boolean;
  request: (email: string) => Promise<void>;
}

/** `inviteCode` — код ссылки-приглашения школы (ADR-0030) со страницы
 * `/join/:code`: сервер молча игнорирует неверный код, письмо уходит в
 * любом случае (SECURITY §2 — существование ссылок наружу не раскрываем). */
export function useEmailLoginRequest(inviteCode?: string): UseEmailLoginRequestResult {
  const [status, setStatus] = useState<EmailLoginRequestStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const sentOnceRef = useRef(false);

  const request = useCallback(
    async (email: string) => {
      setStatus('pending');
      setError(null);
      try {
        await apiFetch<void>('/auth/email/request', {
          method: 'POST',
          body: inviteCode ? { email, inviteCode } : { email },
        });
        sentOnceRef.current = true;
        setStatus('sent');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
      }
    },
    [inviteCode],
  );

  return { status, error, sentOnce: sentOnceRef.current, request };
}
