// Потребление токена входа по email — POST сразу при открытии страницы, из
// JS, а не по нажатию кнопки (ADR-0044, заменяет этот кусок ADR-0029 и
// SECURITY §2 в этой части): сканеры почтовых клиентов открывают ссылки из
// письма сами, но обычным GET, и скрипт страницы не выполняют — токен
// остаётся цел до человека и без кнопки-подтверждения (отзыв владельца:
// «человек пытается зайти, даже если ссылки нет — это неправильно»).
// Логика вынесена из EmailLoginCallbackScreen.tsx (CLAUDE.md «Логика вне
// компонентов»), тот же приём, что useTelegramAuthResultLogin.ts: POST →
// refresh() сессии → сохранённый адрес или домашний экран (postLoginPath,
// аудит L2). `joinCode` (ADR-0030/0036) едет прямо в теле verify —
// отдельного шага «присоединиться после входа» нет.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';
import { postLoginPath } from './returnTo';

type EmailLoginVerifyStatus = 'pending' | 'error';

export interface UseEmailLoginVerifyResult {
  status: EmailLoginVerifyStatus;
  error: string | null;
  /** Статус ApiError неудачного verify — экран (ревью PR #150) отличает 403 (нет
   * валидной ссылки-приглашения или blocked — новое письмо не поможет,
   * «Запросить новую» вернула бы в ту же петлю) от 401 (ссылка устарела) и
   * сети, где кнопка нужна. `null` — успех или сбой без статуса (сеть). */
  errorStatus: number | null;
}

/**
 * `token: null` — сигнал экрана не запускать verify вовсе: ссылка неполная
 * или сессия уже есть (EmailLoginCallbackScreen.tsx решает это по
 * `hasSession(authStatus)`, дожидаясь ответа AuthProvider, чтобы не
 * отправить токен на сервер тем же тиком, что и проверку существующей
 * сессии). Как только `token` становится непустым, эффект запускает verify.
 */
export function useEmailLoginVerify(
  refresh: () => Promise<void>,
  token: string | null,
  joinCode?: string,
): UseEmailLoginVerifyResult {
  const navigate = useNavigate();
  // Начальный статус — pending, не idle: страница с самого начала уже
  // входит, отдельного состояния покоя до запроса больше нет.
  const [status, setStatus] = useState<EmailLoginVerifyStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  // React 19 StrictMode в dev вызывает эффект дважды подряд — без флага
  // токен ушёл бы вторым POST-запросом и сгорел бы раньше первого ответа
  // (тот же приём, что useTelegramAuthResultLogin.ts).
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (token === null) return;
    startedRef.current = true;

    apiFetch<void>('/auth/email/verify', {
      method: 'POST',
      body: joinCode ? { token, inviteCode: joinCode } : { token },
    })
      .then(() => refresh())
      .then(() => {
        void navigate(postLoginPath(), { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setErrorStatus(err instanceof ApiError ? err.status : null);
        setStatus('error');
      });
  }, [token, joinCode, refresh, navigate]);

  return { status, error, errorStatus };
}
