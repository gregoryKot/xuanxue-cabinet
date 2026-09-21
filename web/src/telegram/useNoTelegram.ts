// Отметка «у меня нет Telegram» (`PUT /me/no-telegram`, ADR-0067) — логика
// вынесена из NoTelegramSwitch.tsx (CLAUDE.md «Логика вне компонентов»), по
// образцу auth/useEmailLink.ts. `applyMe` — параметром, не через useAuth()
// внутри хука (тот же приём): так хук проверяется без <AuthProvider> в
// дереве, а NoTelegramSwitch сам решает, откуда брать applyMe(). `PUT
// /me/no-telegram` отдаёт свежий `MeDto` в ответе (ADR-0087) — applyMe кладёт
// его сразу, чтобы `me.noTelegram` изменился без второго `GET /auth/me`:
// без этого переключатель остался бы в прежнем положении до перезагрузки
// страницы (read-after-write, CLAUDE.md).
import { useCallback, useState } from 'react';
import type { MeDto, SetNoTelegramInput } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

// Не в api/apiPaths.ts: там живут только GET-пути, общие с предзагрузкой
// (см. шапку файла) — у мутации своего экрана предзагрузки нет.
const NO_TELEGRAM_PATH = '/me/no-telegram';

export interface UseNoTelegramResult {
  pending: boolean;
  error: string | null;
  set: (noTelegram: boolean) => Promise<void>;
}

export function useNoTelegram(applyMe: (next: MeDto) => void): UseNoTelegramResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(
    async (noTelegram: boolean) => {
      setPending(true);
      setError(null);
      try {
        const body: SetNoTelegramInput = { noTelegram };
        const next = await apiFetch<MeDto>(NO_TELEGRAM_PATH, { method: 'PUT', body });
        applyMe(next);
        setPending(false);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setPending(false);
      }
    },
    [applyMe],
  );

  return { pending, error, set };
}
