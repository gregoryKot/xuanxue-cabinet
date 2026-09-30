// Документ настроек человека создаётся при его первой записи, а не при входе:
// дешёвое чтение раньше записи (`SettingsService.get()` делает так же), E11000
// гонки двух первых записей не роняет второго — документ уже есть после
// первого. Одна функция на NotificationPrefsService и LessonScopeService:
// два места с этим приёмом разошлись бы в обработке гонки.
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import type { NotificationPrefsRecord } from './notification-prefs.schema';

export async function ensurePrefsDoc(
  model: Model<NotificationPrefsRecord>,
  userId: string,
): Promise<void> {
  if (await model.exists({ userId })) return;
  try {
    await model.create({ userId, overrides: [] });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
}
