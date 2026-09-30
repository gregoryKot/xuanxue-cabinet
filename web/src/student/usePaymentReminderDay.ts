// Сохранение своего дня напоминания об оплате (ADR-0161). Выбор уходит на
// сервер сразу, как у переключателей уведомлений (NotificationPrefsSection):
// строка остаётся прежней, пока не пришёл ответ, — при ошибке откатывать нечего.
// Ответ PUT — готовый `MyPaymentReminderDto`: `onSaved` кладёт его на экран без
// перечитывания страницы (ADR-0087, check-write-then-reload).
import { useCallback, useState } from 'react';
import type { MyPaymentReminderDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { errorFrom } from '../components/FormServerError';
import { dayFromValue } from './paymentReminderDayOptions';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить день. Попробуйте ещё раз.';

export interface UsePaymentReminderDayResult {
  pending: boolean;
  error: string | null;
  choose: (value: string) => Promise<void>;
}

export function usePaymentReminderDay(
  onSaved: (reminder: MyPaymentReminderDto) => void,
): UsePaymentReminderDayResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(
    async (value: string) => {
      setPending(true);
      setError(null);
      try {
        const saved = await apiRoute('PUT /me/payments/reminder-day', {
          body: { dayOfMonth: dayFromValue(value) },
        });
        onSaved(saved);
      } catch (err) {
        setError(errorFrom(err, SAVE_ERROR_MESSAGE).message);
      } finally {
        setPending(false);
      }
    },
    [onSaved],
  );

  return { pending, error, choose };
}
