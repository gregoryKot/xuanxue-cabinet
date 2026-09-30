// Когда напоминание об оплате пора слать — чистая логика без Mongo и без DI
// (CLAUDE.md «Тесты»): «сейчас» приходит параметром, день и час считаются в
// поясе школы, только Luxon (CLAUDE.md «Время», ADR-0051, ADR-0150).
import { DateTime } from 'luxon';
import { SETTINGS_LIMITS } from '@xuanxue/shared';
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

/** Какие числа месяца 1..31 сейчас «открыты»: `now` внутри окна
 * `[dueAt, dueAt + сутки)` этого дня (ADR-0161 — день выбирает ученик, поэтому
 * «пора ли» больше не один ответ на всех, а набор чисел). Чисел бывает
 * несколько сразу: 31-е в 30-дневном месяце — это 30-е, и открывшись, оно
 * открывает 30 и 31 вместе. Окно, начатое вчера, ещё открыто утром сегодня.
 * Пустой набор — тик выходит, не сделав ни одного запроса к базе. Включили
 * 20-го, а ученик выбрал 5-е — окно этого месяца давно закрыто: это прошлое напоминание,
 * не текущее, и всем сразу оно не уйдёт. Месяц, как и в `paymentReminderDueAt`,
 * по часам школы: окно не перетекает через границу месяца. */
export function openReminderDays(now: DateTime, tz: string, time: string): Set<number> {
  const open = new Set<number>();
  for (
    let day = SETTINGS_LIMITS.paymentReminderDayMin;
    day <= SETTINGS_LIMITS.paymentReminderDayMax;
    day += 1
  ) {
    const dueAt = paymentReminderDueAt(now, tz, day, time);
    if (now >= dueAt && now < dueAt.plus({ hours: PAYMENT_REMINDER_CATCH_UP_HOURS })) {
      open.add(day);
    }
  }
  return open;
}
