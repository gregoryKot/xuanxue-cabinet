// Общий приём атомарного upsert пользователя по уникальному ключу входа —
// используется и для Telegram (users.service.ts), и для email
// (email-login-user.service.ts): один код на оба пути, не копия по файлам
// (CLAUDE.md «Дубли»). `$setOnInsert` пишет поля только при вставке —
// повторный вход существующего пользователя их не трогает. E11000 на гонке
// двух параллельных первых входов (двойной клик, два тика вебхука) — не
// ошибка сервера, а сигнал перечитать документ, который уже записал
// конкурент: Mongo не всегда повторяет upsert сама при дубликате на
// частичном уникальном индексе.
//
// Возвращает сырой lean-документ, не UserLean: маппер toLean живёт в
// users.service.ts, а этот файл импортирует только тип схемы — обратный
// импорт замкнул бы цикл (eslint import-x/no-cycle), вызывающий код
// маппит результат сам.
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';

export async function upsertUserByKey<TDoc>(
  model: Model<UserRecord>,
  filter: Record<string, unknown>,
  onInsert: Record<string, unknown>,
): Promise<TDoc | null> {
  try {
    const doc = await model
      .findOneAndUpdate(
        filter,
        { $setOnInsert: onInsert },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<TDoc>();
    return doc ?? null;
  } catch (err) {
    if (isDuplicateKeyError(err)) return null;
    throw err;
  }
}
