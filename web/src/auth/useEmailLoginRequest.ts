// Запрос ссылки для входа по почте (ADR-0029) — логика вынесена из формы
// (CLAUDE.md «Логика вне компонентов»): EmailLoginForm.tsx только рендерит
// по `status`/`sentOnce`. Сервер всегда отвечает 204 (SECURITY §2 —
// существование email не раскрывается), поэтому 'error' здесь бывает лишь
// от сети или 503 «Email-вход не подключён» (гонка с конфигурацией, редкий
// случай — LoginScreen.tsx уже прячет форму, пока `emailLoginEnabled` false).
//
// Отсчёт до «Отправить ещё раз» (аудит 2026-10-01, F30): тот же 204 приходит
// и в окне cooldown, когда сервер письма не шлёт, — форма сама считает окно
// от момента успешного запроса (emailResendCountdown.ts) и держит ссылку
// закрытой, пока оно не пройдёт. Таймер — здесь, не в компоненте.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRoute } from '../api/apiRoute';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../api/http';
import { serverNow } from '../api/serverClock';
import { resendCooldownSec } from './emailResendCountdown';

type EmailLoginRequestStatus = 'idle' | 'pending' | 'sent' | 'error';

/** Раз в секунду — отсчёт показывает секунды. */
const COUNTDOWN_TICK_MS = 1000;

export interface UseEmailLoginRequestResult {
  status: EmailLoginRequestStatus;
  error: string | null;
  /** true — хоть один запрос уже завершился успехом. Не сбрасывается
   * повторным сбоем «Отправить ещё раз» — форма не должна возвращаться
   * после того, как письмо один раз ушло. */
  sentOnce: boolean;
  /** Секунд до повторной отправки; 0 — можно слать (или ещё не слали). */
  resendAvailableInSec: number;
  request: (email: string) => Promise<void>;
}

/** `inviteCode` — код ссылки-приглашения школы (ADR-0030) со страницы
 * `/join/:code`: сервер молча игнорирует неверный код, письмо уходит в
 * любом случае (SECURITY §2 — существование ссылок наружу не раскрываем). */
export function useEmailLoginRequest(inviteCode?: string): UseEmailLoginRequestResult {
  const [status, setStatus] = useState<EmailLoginRequestStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const sentOnceRef = useRef(false);
  const [sentAtMs, setSentAtMs] = useState<number | null>(null);
  // Часы ставятся в момент отправки, не при монтировании: иначе до первого
  // тика остаток считался бы от давно устаревшего «сейчас».
  const [nowMs, setNowMs] = useState(0);
  const resendAvailableInSec = resendCooldownSec(sentAtMs, nowMs);
  const ticking = resendAvailableInSec > 0;

  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNowMs(serverNow()), COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  const request = useCallback(
    async (email: string) => {
      setStatus('pending');
      setError(null);
      try {
        await apiRoute('POST /auth/email/request', {
          body: inviteCode ? { email, inviteCode } : { email },
        });
        sentOnceRef.current = true;
        const sentAt = serverNow();
        setSentAtMs(sentAt);
        setNowMs(sentAt);
        setStatus('sent');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
        setStatus('error');
      }
    },
    [inviteCode],
  );

  return {
    status,
    error,
    sentOnce: sentOnceRef.current,
    resendAvailableInSec,
    request,
  };
}
