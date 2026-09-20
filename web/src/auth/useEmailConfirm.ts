// Потребление токена подтверждения почты (`POST /auth/email/confirm`,
// `@Public()`, ADR-0059) — уходит сам при открытии страницы, из JS, тем же
// приёмом, что вход по почте (ADR-0044, useEmailLoginVerify.ts): сканеры
// почтовых клиентов открывают ссылки из письма сами, но обычным GET, и
// скрипт страницы не выполняют — токен остаётся цел до человека, кнопка
// «Подтвердить» не нужна. В отличие от входа, здесь нет ни сессии, ни
// редиректа: это подтверждение адреса, не вход (EmailConfirmScreen.tsx
// объясняет это же комментарием у себя) — success только меняет статус,
// куда идти дальше, решает сам экран (кнопка «Открыть кабинет»).
import { useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

type EmailConfirmStatus = 'pending' | 'success' | 'error';

export interface UseEmailConfirmResult {
  status: EmailConfirmStatus;
  /** Текст для `role="alert"`; заполнен только при status === 'error'. */
  error: string | null;
}

/**
 * `token: null` — сигнал не запускать запрос вовсе: ссылка неполная
 * (EmailConfirmScreen.tsx проверяет формат `EMAIL_CONFIRM_TOKEN_RE` до
 * вызова хука, чтобы не звать сервер с заведомо обрезанной ссылкой).
 */
export function useEmailConfirm(token: string | null): UseEmailConfirmResult {
  const [status, setStatus] = useState<EmailConfirmStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  // React 19 StrictMode вызывает эффект дважды подряд — без флага токен ушёл
  // бы вторым POST-запросом и сгорел бы раньше первого ответа (тот же приём,
  // что useEmailLoginVerify.ts).
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (token === null) return;
    startedRef.current = true;

    apiFetch<void>('/auth/email/confirm', { method: 'POST', body: { token } })
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
      });
  }, [token]);

  return { status, error };
}
