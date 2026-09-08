// Завершение мобильного входа через Telegram (см. telegramAuthResult.ts —
// баг с прода, найден 2026-09-08). При открытии экрана входа читаем
// #tgAuthResult= из адреса и, если он есть, идём тем же путём, что и клик по
// кнопке на десктопе: POST /auth/telegram → refresh() сессии → /schedule.
// Логика вынесена из LoginScreen.tsx в хук (CLAUDE.md «Логика вне
// компонентов» и файловый храповик — компонент иначе не помещается в лимит).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';
import { readTelegramAuthResult } from './telegramAuthResult';

const LOGIN_FAILED_MESSAGE = 'Не удалось войти. Попробуйте ещё раз.';

/** POST /auth/telegram — общий шаг для клика по кнопке (LoginScreen.tsx) и
 * для автозавершения из фрагмента ниже: один путь на сервер, не два. */
export function postTelegramLogin(user: TelegramLoginInput): Promise<void> {
  return apiFetch('/auth/telegram', { method: 'POST', body: user });
}

export interface UseTelegramAuthResultLoginResult {
  pending: boolean;
  error: string | null;
}

export function useTelegramAuthResultLogin(
  refresh: () => Promise<void>,
): UseTelegramAuthResultLoginResult {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // React 19 StrictMode в dev вызывает эффект дважды подряд — без флага
  // фрагмент отправился бы на сервер вторым POST-запросом с уже
  // использованным (но ещё формально валидным до TTL) payload'ом.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    const user = readTelegramAuthResult(window.location.hash);
    if (!user) return;
    startedRef.current = true;

    // replaceState, не pushState: убираем #tgAuthResult= из адреса, не
    // добавляя запись в историю — правило CLAUDE.md про pushState касается
    // открытия листов (useHistorySheet), здесь наоборот мы не хотим, чтобы
    // «Назад» браузера возвращал на URL с чужими данными входа во фрагменте.
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', pathname + search);

    setPending(true);
    postTelegramLogin(user)
      .then(() => refresh())
      .then(() => navigate('/schedule', { replace: true }))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : LOGIN_FAILED_MESSAGE);
      })
      .finally(() => setPending(false));
  }, [navigate, refresh]);

  return { pending, error };
}
