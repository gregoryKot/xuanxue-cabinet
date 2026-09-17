// Логика экрана `/join/:code` (ADR-0030/0034) — вынесена из JoinScreen.tsx
// (CLAUDE.md «Логика вне компонентов»). Проверяет код без входа
// (`POST /auth/join/check`, `@Public()`) — страница не должна гнать
// человека логиниться зря на мёртвую ссылку. Сама регистрация идёт внутри
// POST /auth/telegram / POST /auth/email/verify (код передаётся туда,
// TelegramLoginSection.tsx/EmailLoginForm.tsx) — отдельного шага
// «присоединиться после входа» больше нет, JoinScreen сам уходит на
// «Расписание», как только authStatus становится 'ok'.
import { useEffect, useState } from 'react';
import { INVITE_CODE_RE, type CheckInviteResultDto } from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';

type CheckStatus = 'loading' | 'valid' | 'invalid' | 'offline';

// DTO /auth/join/check отвергает код вне формата 400-м — тот же путь catch,
// что и сетевой сбой, если их не различать (баг: /join/<мусор> показывал
// «Нет связи с сервером» вместо «Ссылка не подошла»).
const INVALID_INPUT_STATUS = 400;

export interface UseJoinByInviteResult {
  checkStatus: CheckStatus;
  /** Повторить POST /auth/join/check после сетевого сбоя (checkStatus === 'offline'). */
  retryCheck: () => void;
}

/** `enabled` — по умолчанию `true`; JoinScreen передаёт `false`, пока не
 * известно, что сессии нет (authStatus === 'guest') — вошедшего сразу уводит
 * на «Расписание», и звать check незачем. Пока выключен, checkStatus
 * остаётся в начальном 'loading', запроса нет. */
export function useJoinByInvite(code: string, enabled = true): UseJoinByInviteResult {
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('loading');
  const [checkAttempt, setCheckAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    // Код не по формату (32 hex, INVITE_CODE_RE) — сразу «не подошла» без
    // похода в сеть: сервер всё равно ответит 400 на такой код, а ветка catch
    // ниже видит только «запрос упал», не «упал из-за чего».
    if (!INVITE_CODE_RE.test(code)) {
      setCheckStatus('invalid');
      return;
    }
    let cancelled = false;
    setCheckStatus('loading');
    apiFetch<CheckInviteResultDto>('/auth/join/check', { method: 'POST', body: { code } })
      .then((res) => {
        if (!cancelled) setCheckStatus(res.valid ? 'valid' : 'invalid');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 400 (DTO отвергла форму кода) — «ссылка не подошла», не «нет связи»;
        // сеть/5xx/429 — offline с кнопкой «Повторить» (CLAUDE.md «Ошибки»).
        setCheckStatus(
          err instanceof ApiError && err.status === INVALID_INPUT_STATUS
            ? 'invalid'
            : 'offline',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [code, checkAttempt, enabled]);

  return { checkStatus, retryCheck: () => setCheckAttempt((n) => n + 1) };
}
