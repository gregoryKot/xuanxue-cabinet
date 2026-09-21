// Попап «Время вышло» — только тому, у кого дедлайн наступил прямо на этом
// сеансе экрана (отзыв владельца 2026-09-21): экран был открыт на попытке
// `in_progress`, и сервер на одном из следующих ответов отдал её уже закрытой
// по времени (`expired: true`). Кто открыл уже закрытую попытку заново
// (обновил страницу спустя час после дедлайна), окна не видит — он и так
// читает «Время вышло…» на экране «Отправлено» (AttemptSubmitted.tsx), и
// говорить это дважды незачем.
import { useEffect, useRef, useState } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';

export interface UseExpiryNoticeResult {
  showing: boolean;
  /** Закрыть попап — после этого он не возвращается за время жизни экрана. */
  dismiss: () => void;
}

export function useExpiryNotice(attempt: ExamAttemptDto | null): UseExpiryNoticeResult {
  const wasInProgress = useRef(false);
  const dismissed = useRef(false);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (!attempt) return;
    if (attempt.status === 'in_progress') {
      wasInProgress.current = true;
      return;
    }
    // Переход виден только тому, кто застал попытку живой на этом самом
    // экране (wasInProgress) — иначе первая же загрузка уже закрытой попытки
    // показывала бы попап, дублируя текст AttemptSubmitted.tsx.
    if (wasInProgress.current && attempt.expired && !dismissed.current) {
      setShowing(true);
    }
  }, [attempt]);

  function dismiss() {
    dismissed.current = true;
    setShowing(false);
  }

  return { showing, dismiss };
}
