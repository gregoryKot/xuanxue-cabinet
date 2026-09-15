// Завершение входа через Telegram после возврата (см. telegramAuthResult.ts —
// баг с прода, найден 2026-09-08). Кнопка на LoginScreen.tsx лишь уводит
// вкладку на Telegram (ADR-0028); при возврате на /login читаем
// #tgAuthResult= из адреса и, если он есть, отправляем на сервер сами:
// POST /auth/telegram → refresh() сессии → /schedule. Логика вынесена из
// LoginScreen.tsx в хук (CLAUDE.md «Логика вне компонентов» и файловый
// храповик — компонент иначе не помещается в лимит).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';
import { readTelegramAuthResult } from './telegramAuthResult';

const LOGIN_FAILED_MESSAGE = 'Не удалось войти. Попробуйте ещё раз.';

// POST /auth/telegram — теперь единственный вызывающий этот хук: кнопка
// (LoginScreen.tsx) сама лишь уводит вкладку на Telegram (ADR-0028), сервер
// получает подтверждённый вход только отсюда, при возврате.
function postTelegramLogin(user: TelegramLoginInput): Promise<void> {
  return apiFetch('/auth/telegram', { method: 'POST', body: user });
}

export interface UseTelegramAuthResultLoginResult {
  pending: boolean;
  error: string | null;
}

export interface UseTelegramAuthResultLoginOptions {
  /** По умолчанию — переход на /schedule после успешного входа (LoginScreen).
   * `false` — экран сам решает, что дальше (JoinScreen.tsx: ссылка-приглашение,
   * ADR-0030, ведёт на /schedule только после своего POST /auth/join). */
  navigateAfterLogin?: boolean;
}

export function useTelegramAuthResultLogin(
  refresh: () => Promise<void>,
  options: UseTelegramAuthResultLoginOptions = {},
): UseTelegramAuthResultLoginResult {
  const { navigateAfterLogin = true } = options;
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
      .then(() => {
        if (navigateAfterLogin) void navigate('/schedule', { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : LOGIN_FAILED_MESSAGE);
      })
      .finally(() => setPending(false));
  }, [navigate, refresh, navigateAfterLogin]);

  return { pending, error };
}
