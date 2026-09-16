// Логика экрана `/join/:code` (ADR-0030/0034) — вынесена из JoinScreen.tsx
// (CLAUDE.md «Логика вне компонентов»). Проверяет код без входа
// (`POST /auth/join/check`, `@Public()`) — страница не должна гнать
// человека логиниться зря на мёртвую ссылку. Сама регистрация идёт внутри
// POST /auth/telegram / POST /auth/email/verify (код передаётся туда,
// TelegramLoginSection.tsx/EmailLoginForm.tsx) — отдельного шага
// «присоединиться после входа» больше нет, JoinScreen сам уходит на
// «Расписание», как только authStatus становится 'ok'.
import { useEffect, useState } from 'react';
import type { CheckInviteResultDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';

type CheckStatus = 'loading' | 'valid' | 'invalid' | 'offline';

export interface UseJoinByInviteResult {
  checkStatus: CheckStatus;
  /** Повторить POST /auth/join/check после сетевого сбоя (checkStatus === 'offline'). */
  retryCheck: () => void;
}

export function useJoinByInvite(code: string): UseJoinByInviteResult {
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('loading');
  const [checkAttempt, setCheckAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCheckStatus('loading');
    apiFetch<CheckInviteResultDto>('/auth/join/check', { method: 'POST', body: { code } })
      .then((res) => {
        if (!cancelled) setCheckStatus(res.valid ? 'valid' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setCheckStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [code, checkAttempt]);

  return { checkStatus, retryCheck: () => setCheckAttempt((n) => n + 1) };
}
