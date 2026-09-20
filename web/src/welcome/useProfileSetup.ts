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
  /** Сохранить текущее имя, не уходя со страницы — нужен `SecondLoginKey`
   * (ADR-0059, `onBeforeLink` у `telegram/TelegramLinkButton.tsx`): на
   * `/welcome` человек мог начать вводить имя и тут же нажать «Связать
   * Telegram», уходя вкладкой в Telegram, — черновик не должен пропасть.
   * Пустое имя — нечего сохранять; `true` здесь значит «отказа нет», а не
   * «сохранено» — переход в Telegram не обязан ждать имени. */
  save: () => Promise<boolean>;
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

  const save = useCallback(async (): Promise<boolean> => {
    const trimmedFirstName = firstName.trim();
    // Пустое имя — нечего сохранять, но и блокировать переход в Telegram
    // незачем (кнопка «Продолжить» и так недоступна при пустом имени —
    // подстраховка нужна отдельно, ниже, только для submit()).
    if (trimmedFirstName === '') return true;
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
      return false;
    }
    setStatus('idle');
    return true;
  }, [firstName, lastName, refresh]);

  const submit = useCallback(async () => {
    // Подстраховка: кнопка и так недоступна при пустом имени
    // (WelcomeScreen.tsx) — save() тоже не сохраняет пустое имя, но здесь,
    // в отличие от save(), пустое имя не должно звать onSaved(): /welcome не
    // имеет права уйти на следующий экран, ничего не сохранив.
    if (firstName.trim() === '') return;
    if (await save()) onSaved();
  }, [firstName, save, onSaved]);

  return { firstName, lastName, setFirstName, setLastName, status, error, save, submit };
}
