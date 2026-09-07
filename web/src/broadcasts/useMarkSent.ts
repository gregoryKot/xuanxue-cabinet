// «Отметить отправленным» для ручной доставки (docs/PLAN.md §6 «Доставка»):
// POST /deliveries/:id/mark-sent, читает список заново там, где он открыт
// (переданный `onSent` — read-after-write, вызывающий код сам решает, что
// перечитать: журнал рассылки или список «Ждут отправки вручную»).
import { useState } from 'react';
import { ApiError, apiFetch } from '../api/http';

const MARK_SENT_ERROR = 'Не удалось отметить отправленным. Попробуйте ещё раз.';

export interface UseMarkSentResult {
  pending: boolean;
  error: string | null;
  markSent: (deliveryId: string) => Promise<void>;
}

export function useMarkSent(onSent: () => Promise<void>): UseMarkSentResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markSent(deliveryId: string): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/deliveries/${deliveryId}/mark-sent`, { method: 'POST' });
      await onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : MARK_SENT_ERROR);
    } finally {
      setPending(false);
    }
  }

  return { pending, error, markSent };
}
