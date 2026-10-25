// Занятость и ошибка одной строки оплат: кнопка блокируется на время запроса,
// сбой встаёт строкой под действием — у каждой строки своя, а не одна на
// экран (тот же приём, что run() в people/PersonRow.tsx, вынесенный в хук).
import { useCallback, useState } from 'react';
import { ApiError } from '../api/http';

const SAVE_ERROR_MESSAGE = 'Не получилось сохранить. Попробуйте ещё раз.';

export interface PaymentRowAction {
  pending: boolean;
  error: string | null;
  run: (action: () => Promise<void>) => Promise<void>;
}

export function usePaymentRowAction(): PaymentRowAction {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : SAVE_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, run };
}
