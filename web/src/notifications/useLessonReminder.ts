// Сохранение личного «за сколько напомнить» о занятии (ADR-0162, п. 3). Выбор
// уходит на сервер сразу, как у переключателей уведомлений: строка остаётся
// прежней, пока не пришёл ответ, — при ошибке откатывать нечего. Ответ PUT — то
// же, что `GET /me/notifications/lessons`; `onSaved` кладёт его на экран без
// перечитывания (ADR-0087, check-write-then-reload). Тот же приём, что у
// student/usePaymentReminderDay.ts.
import { useCallback, useState } from 'react';
import type { MyLessonNotificationsDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { errorFrom } from '../components/FormServerError';
import { reminderMinutesFromValue } from './lessonReminderOptions';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';

export interface UseLessonReminderResult {
  /** Идёт запись — поле на это время выключено. */
  pending: boolean;
  error: string | null;
  choose: (value: string) => Promise<void>;
}

export function useLessonReminder(
  onSaved: (saved: MyLessonNotificationsDto) => void,
): UseLessonReminderResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(
    async (value: string) => {
      setPending(true);
      setError(null);
      try {
        const saved = await apiRoute('PUT /me/notifications/lessons/reminder-minutes', {
          body: { minutes: reminderMinutesFromValue(value) },
        });
        onSaved(saved);
      } catch (err) {
        // Текст ответа сервера уже написан для человека — показываем его, а не
        // общую фразу (так же, как saveError у useLessonScope.ts).
        setError(errorFrom(err, SAVE_ERROR_MESSAGE).message);
      } finally {
        setPending(false);
      }
    },
    [onSaved],
  );

  return { pending, error, choose };
}
