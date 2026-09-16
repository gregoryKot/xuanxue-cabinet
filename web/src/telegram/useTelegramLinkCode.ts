// Связка Telegram с уже существующим аккаунтом (ADR-0034) — логика вынесена
// из кнопки (CLAUDE.md «Логика вне компонентов»): TelegramLinkButton.tsx
// только рендерит по pending/error. Код одноразовый и живёт внутри
// telegramUrl с сервера (shared/src/telegram-link.ts) — хранить его в
// localStorage незачем и запрещено (CLAUDE.md «Безопасность»).
import { useCallback, useState } from 'react';
import type { TelegramLinkCodeDto } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';
import { redirectCurrentTab } from '../auth/telegramAuthRedirect';

export interface UseTelegramLinkCodeResult {
  pending: boolean;
  /** Текст для `role="alert"`; `null` — ошибки нет. */
  error: string | null;
  /** `true` — код получен, вкладка уже уходит в Telegram (redirectCurrentTab,
   * тот же приём, что вход через Telegram, ADR-0028). `false` — сбой, текст
   * уже в `error`. Возврат по образцу `addMediaLink` (useAttempt.ts):
   * вызывающему не нужно читать состояние хука в том же тике. */
  link: () => Promise<boolean>;
}

export function useTelegramLinkCode(): UseTelegramLinkCodeResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = useCallback(async (): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      const { telegramUrl } = await apiFetch<TelegramLinkCodeDto>(
        '/auth/telegram/link-code',
        { method: 'POST' },
      );
      // Успех — вкладка уже переходит в Telegram, pending нарочно не
      // сбрасываем: кнопка остаётся «занятой» до того, как страница уйдёт.
      redirectCurrentTab(telegramUrl);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
      setPending(false);
      return false;
    }
  }, []);

  return { pending, error, link };
}
