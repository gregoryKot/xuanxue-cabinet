// Привязка почты вторым ключом входа (ADR-0059, `POST /auth/email/link`,
// нужна сессия) — логика вынесена из форм (CLAUDE.md «Логика вне
// компонентов»), по образцу useEmailLoginRequest.ts. `refresh` — параметром,
// не через useAuth() внутри хука (тот же приём, что welcome/useProfileSetup.ts):
// так хук проверяется без <AuthProvider> в дереве, а вызывающий сам решает,
// откуда брать refresh() (SecondLoginKey.tsx передаёт его же и в форму, и в
// напоминание). После успеха зовём refresh(), чтобы `me.pendingEmail`
// появился сразу — read-after-write (CLAUDE.md): без этого напоминание
// «откройте ссылку из письма» осталось бы без адреса до следующей перезагрузки.
import { useCallback, useState } from 'react';
import type { LinkEmailInput } from '@xuanxue/shared';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

type EmailLinkStatus = 'idle' | 'pending' | 'sent' | 'error';

export interface UseEmailLinkResult {
  status: EmailLinkStatus;
  error: string | null;
  link: (email: string) => Promise<void>;
}

export function useEmailLink(refresh: () => Promise<void>): UseEmailLinkResult {
  const [status, setStatus] = useState<EmailLinkStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const link = useCallback(
    async (email: string) => {
      setStatus('pending');
      setError(null);
      try {
        const body: LinkEmailInput = { email };
        await apiFetch<void>('/auth/email/link', { method: 'POST', body });
        await refresh();
        setStatus('sent');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
      }
    },
    [refresh],
  );

  return { status, error, link };
}
