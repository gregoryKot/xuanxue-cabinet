// «Записать строку ленты, только если её ещё нет» (ADR-0162). Напоминание о
// занятии делается по человеку, а не по занятию: «уже напомнили» больше не
// отметка на занятии (`studentReminderSentAt` удалена), а сама строка ленты с
// уникальным индексом (userId, kind, lessonId). Отсюда две разницы с
// `writeNotificationRow`: повторная запись не поднимает прочитанную или убранную
// строку снова, и вызывающий узнаёт, вставил ли он строку, — push уходит только
// тому, кто её вставил, иначе два инстанса при деплое прислали бы его дважды.
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { identityFilter, rowPayload, type WriteInput } from './in-app-staff-write';
import type { NotificationRecord } from './notification.schema';

/** `true` — строку вставил этот вызов; `false` — она уже была (написана
 * раньше, прошлым тиком, старым кодом или соседним инстансом прямо сейчас).
 * Атомарность даёт уникальный индекс, а не проверка перед записью: обычная
 * вставка, а не upsert — `updateOne` с upsert у Mongoose трогал бы `updatedAt`
 * уже существующей строки и поднимал её в ленте, а здесь строка не должна
 * меняться вовсе. */
export async function insertNotificationRowOnce(
  model: Model<NotificationRecord>,
  input: WriteInput,
): Promise<boolean> {
  try {
    await model.create({ ...identityFilter(input), ...rowPayload(input) });
    return true;
  } catch (err) {
    if (isDuplicateKeyError(err)) return false;
    throw err;
  }
}
