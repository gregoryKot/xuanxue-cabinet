// Запись telegramId на уже существующий аккаунт (ADR-0034,
// telegram-link.service.ts) — вынесено из users.service.ts отдельным файлом
// тем же приёмом, что mark-joined-via-invite.ts/upsert-user-by-key.ts:
// сервис не растёт за 150 строк (file-size-ratchet).
//
// `telegramId: { $exists: false }` в фильтре и ловля E11000 — защита от
// гонки двух одновременных связок с одним и тем же Telegram на разные
// аккаунты: частичный уникальный индекс telegramId (user.schema.ts)
// пропустит запись только одному из них, второй обязан получить `null`, а
// не 500 или молчаливую перезапись чужой связки.
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';

export async function attachTelegramId(
  model: Model<UserRecord>,
  userId: string,
  telegramId: number,
): Promise<UserLean | null> {
  try {
    const doc = await model
      .findOneAndUpdate(
        { _id: userId, telegramId: { $exists: false } },
        { $set: { telegramId } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc | null>();
    return doc ? toLean(doc) : null;
  } catch (err) {
    if (isDuplicateKeyError(err)) return null;
    throw err;
  }
}
