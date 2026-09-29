// Когда напоминание об оплате пора слать — чистая логика без Mongo и без DI
// (CLAUDE.md «Тесты»): «сейчас» приходит параметром, день и час считаются в
// поясе школы, только Luxon (CLAUDE.md «Время», ADR-0051, ADR-0150).
import { DateTime } from 'luxon';
import type { PaymentReminderSettings } from '@xuanxue/shared';
import { parseRuleTime } from '../lessons/lesson-occurrences';

// Окно, в течение которого момент отправки ещё «текущий». Шаг тика идёт раз в
// минуту, но «ровно эта минута» ловила бы напоминание только при идеально
// здоровом планировщике: деплой в 10:00, простой тика или пакет, не
// уместившийся в один тик (PAYMENT_REMINDER_BATCH_LIMIT), потеряли бы его
// молча — а тихий отказ в продукте про рассылки дороже всего. Сутки — потому
// что напоминание про месяц, и пропустить его на час не страшно, а на день
// уже «вчерашнее». Второй раз человеку оно не уйдёт: право на отправку
// забирает `reminderSentAt` (payment-reminder.service.ts), не окно.
export const PAYMENT_REMINDER_CATCH_UP_HOURS = 24;

/** Момент отправки в ТЕКУЩЕМ месяце (по часам школы). Ровно 31-е в феврале —
 * последний день месяца, а не пропуск (ADR-0051). Время — 'HH:mm' в поясе
 * школы, поэтому через переход на летнее время минута по часам школы не
 * сдвигается: 10:00 остаётся 10:00, меняется только смещение от UTC. */
export function paymentReminderDueAt(
  now: DateTime,
  tz: string,
  dayOfMonth: number,
  time: string,
): DateTime {
  const local = now.setZone(tz);
  const { hour, minute } = parseRuleTime(time);
  return DateTime.fromObject(
    {
      year: local.year,
      month: local.month,
      day: Math.min(dayOfMonth, local.daysInMonth ?? dayOfMonth),
      hour,
      minute,
    },
    { zone: tz },
  );
}

/** Пора ли слать: включено и `now` внутри окна `[dueAt, dueAt + сутки)`.
 * Включили 20-го при дне 5 — окно этого месяца давно закрыто: это уже
 * прошлое напоминание, не текущее, и всем сразу оно не уйдёт. */
export function isPaymentReminderDue(
  now: DateTime,
  tz: string,
  reminder: PaymentReminderSettings,
): boolean {
  if (!reminder.enabled) return false;
  const dueAt = paymentReminderDueAt(now, tz, reminder.dayOfMonth, reminder.time);
  return now >= dueAt && now < dueAt.plus({ hours: PAYMENT_REMINDER_CATCH_UP_HOURS });
}
