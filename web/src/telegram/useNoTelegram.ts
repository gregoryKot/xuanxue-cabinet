// Отметка «у меня нет Telegram» (`PUT /me/no-telegram`, ADR-0067) — логика
// вынесена из NoTelegramSwitch.tsx (CLAUDE.md «Логика вне компонентов»), по
// образцу auth/useEmailLink.ts. `refresh` — параметром, не через useAuth()
// внутри хука (тот же приём): так хук проверяется без <AuthProvider> в
// дереве, а NoTelegramSwitch сам решает, откуда брать refresh(). После
// успеха зовём refresh(), чтобы `me.noTelegram` изменился сразу —
// read-after-write (CLAUDE.md): без этого переключатель остался бы в
// прежнем положении до перезагрузки страницы.
import { useCallback, useState } from 'react';
import type { SetNoTelegramInput } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

// Не в api/apiPaths.ts: там живут только GET-пути, общие с предзагрузкой
// (см. шапку файла) — у мутации своего экрана предзагрузки нет.
const NO_TELEGRAM_PATH = '/me/no-telegram';

export interface UseNoTelegramResult {
  pending: boolean;
  error: string | null;
  set: (noTelegram: boolean) => Promise<void>;
}

export function useNoTelegram(refresh: () => Promise<void>): UseNoTelegramResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(
    async (noTelegram: boolean) => {
      setPending(true);
      setError(null);
      try {
        const body: SetNoTelegramInput = { noTelegram };
        await apiFetch<void>(NO_TELEGRAM_PATH, { method: 'PUT', body });
        await refresh();
        setPending(false);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setPending(false);
      }
    },
    [refresh],
  );

  return { pending, error, set };
}
