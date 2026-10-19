// Своё «за сколько напомнить» в документе настроек для тестов тика и сводки. Пишет его
// только синхронизация напоминаний (ADR-0185, PATCH /me/notifications/lessons/sync);
// тестам, которым нужен лишь результат, её цепочка не нужна — значение ложится в
// документ напрямую, как оно лежит после записи. `null` — «как в школе»: поле снято,
// а не равно нулю (`0` — «в момент начала занятия»).
import type { Model } from 'mongoose';
import type { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';

export function writeOwnReminderMinutes(
  model: Model<NotificationPrefsRecord>,
  userId: string,
  minutes: number | null,
) {
  const update =
    minutes === null
      ? { $unset: { lessonReminderMinutes: 1 } }
      : { $set: { lessonReminderMinutes: minutes } };
  return model.updateOne({ userId }, update, { upsert: true });
}
