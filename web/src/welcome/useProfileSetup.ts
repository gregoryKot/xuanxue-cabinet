// Имя на первом входе (ADR-0044, `PATCH /me/profile`) — логика вынесена из
// WelcomeScreen.tsx (CLAUDE.md «Логика вне компонентов»), тот же приём, что
// useEmailLoginVerify.ts: запрос → refresh() сессии → сохранённый адрес или
// домашний экран (postLoginPath). Поля формы тоже здесь, не в компоненте:
// обрезка пробелов при отправке и то, что при ошибке они не стираются, —
// часть той же логики, не рендера.
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { splitPersonName, type UpdateMyProfileInput } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';
import { postLoginPath } from '../auth/returnTo';

type ProfileSetupStatus = 'idle' | 'pending' | 'error';

export interface UseProfileSetupResult {
  firstName: string;
  lastName: string;
  setFirstName: (value: string) => void;
  setLastName: (value: string) => void;
  status: ProfileSetupStatus;
  error: string | null;
  submit: () => Promise<void>;
}

/**
 * `initialName` — то, что кабинет уже знает о человеке (`me.name`): у
 * пришедшего через Telegram это имя и фамилия из Telegram, у пришедшего по
 * почте — заглушка `NEW_PERSON_NAME`, `splitPersonName` превращает её в
 * пустые поля. `refresh` берётся из useAuth() самим экраном, не отсюда (тот
 * же приём, что у useEmailLoginVerify.ts) — так хук проверяется без
 * <AuthProvider> в дереве.
 */
export function useProfileSetup(
  initialName: string,
  refresh: () => Promise<void>,
): UseProfileSetupResult {
  const navigate = useNavigate();
  const initial = splitPersonName(initialName);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [status, setStatus] = useState<ProfileSetupStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmedFirstName = firstName.trim();
    // Подстраховка: кнопка и так недоступна при пустом имени (WelcomeScreen.tsx).
    if (trimmedFirstName === '') return;
    setStatus('pending');
    setError(null);
    const trimmedLastName = lastName.trim();
    const body: UpdateMyProfileInput = trimmedLastName
      ? { firstName: trimmedFirstName, lastName: trimmedLastName }
      : { firstName: trimmedFirstName };
    try {
      await apiFetch<void>('/me/profile', { method: 'PATCH', body });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
      setStatus('error');
      return;
    }
    setStatus('idle');
    void navigate(postLoginPath(), { replace: true });
  }, [firstName, lastName, refresh, navigate]);

  return { firstName, lastName, setFirstName, setLastName, status, error, submit };
}
