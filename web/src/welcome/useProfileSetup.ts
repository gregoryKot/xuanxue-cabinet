// Форма имени на первом входе (ADR-0044, `PATCH /me/profile`) и на экране
// «Профиль» (ADR-0045) — один хук на оба места (CLAUDE.md «Одна механика —
// один компонент»), вынесен из WelcomeScreen.tsx (CLAUDE.md «Логика вне
// компонентов»). Куда идти после сохранения решает экран, не хук: `/welcome`
// уходит на postLoginPath(), «Профиль» остаётся на месте и показывает тихую
// строку «Имя сохранено» — поэтому `onSaved()` обязателен третьим параметром
// и зовётся уже после refresh() сессии. Поля формы тоже здесь, не в
// компоненте: обрезка пробелов при отправке и то, что при ошибке они не
// стираются, — часть той же логики, не рендера.
import { useCallback, useState } from 'react';
import { splitPersonName, type UpdateMyProfileInput } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

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
 * <AuthProvider> в дереве. `onSaved` — тоже забота экрана: `/welcome` уходит
 * дальше, «Профиль» просто показывает результат.
 */
export function useProfileSetup(
  initialName: string,
  refresh: () => Promise<void>,
  onSaved: () => void,
): UseProfileSetupResult {
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
    onSaved();
  }, [firstName, lastName, refresh, onSaved]);

  return { firstName, lastName, setFirstName, setLastName, status, error, submit };
}
