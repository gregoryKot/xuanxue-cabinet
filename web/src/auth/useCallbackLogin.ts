// Общий механизм экранов возврата (email-ссылка, Google): POST уходит сам,
// из JS, сразу при открытии страницы, ровно один раз (React 19 StrictMode
// вызывает эффект дважды — startedRef тот же приём, что у
// useTelegramAuthResultLogin.ts) → refresh() сессии → сохранённый адрес или
// домашний экран (postLoginPath, аудит L2). Раньше это был отдельный код
// useEmailLoginVerify.ts — вынесено сюда, чтобы Google-вход не повторял его
// целиком (CLAUDE.md «Одна механика — один компонент», jscpd);
// useEmailLoginVerify.ts остаётся тонкой обёрткой над этим хуком.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiRouteBody } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../api/http';
import { postLoginPath } from './returnTo';

type CallbackLoginStatus = 'pending' | 'error';

/** Запрос возврата — ключ карты и тело к нему: сегодня письмо и Google, оба
 * отвечают `MeDto`, но экран возврата его не читает — сессию перечитывает
 * `refresh()`. */
export type CallbackLoginRequest =
  | { key: 'POST /auth/email/verify'; body: ApiRouteBody<'POST /auth/email/verify'> }
  | { key: 'POST /auth/google'; body: ApiRouteBody<'POST /auth/google'> };

// switch, а не `apiRoute(request.key, …)`: TS не сужает обобщённый ключ по
// дискриминанту, и тело сверялось бы с объединением обоих.
function callbackLoginCall(request: CallbackLoginRequest): Promise<unknown> {
  switch (request.key) {
    case 'POST /auth/email/verify':
      return apiRoute(request.key, { body: request.body });
    case 'POST /auth/google':
      return apiRoute(request.key, { body: request.body });
  }
}

export interface UseCallbackLoginResult {
  status: CallbackLoginStatus;
  error: string | null;
  /** Статус ApiError неудачного запроса — экран отличает 403 (нет валидной
   * ссылки-приглашения или blocked) от остальных ошибок. `null` — успех или
   * сбой без статуса (сеть). */
  errorStatus: number | null;
}

/**
 * `request: null` — сигнал не запускать запрос вовсе (ссылка неполная,
 * отменённый вход, уже есть сессия — экран решает это сам, дожидаясь ответа
 * AuthProvider, чтобы не отправить запрос тем же тиком, что и проверку
 * существующей сессии). Как только `request` становится непустым, эффект
 * запускает `POST` по ключу запроса.
 */
export function useCallbackLogin(
  refresh: () => Promise<void>,
  request: CallbackLoginRequest | null,
): UseCallbackLoginResult {
  const navigate = useNavigate();
  // Начальный статус — pending, не idle: страница с самого начала уже входит.
  const [status, setStatus] = useState<CallbackLoginStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (request === null) return;
    startedRef.current = true;

    callbackLoginCall(request)
      .then(() => refresh())
      .then(() => {
        void navigate(postLoginPath(), { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setErrorStatus(err instanceof ApiError ? err.status : null);
        setStatus('error');
      });
    // request — новый объект на каждый рендер (вызывающий экран строит его из
    // query-параметров) — эффект перезапускается без пользы, но startedRef
    // уже не даёт второй запрос, поэтому это безвредно и не требует
    // отключения exhaustive-deps.
  }, [request, refresh, navigate]);

  return { status, error, errorStatus };
}
