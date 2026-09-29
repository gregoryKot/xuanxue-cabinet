// Запись googleId на уже существующий аккаунт, найденный по подтверждённому
// email (ADR-0145) — тот же приём, что attach-telegram-id.ts (ADR-0034):
// `googleId: { $exists: false }` в фильтре и ловля E11000 защищают от гонки
// двух одновременных первых входов через Google на разные аккаунты —
// частичный уникальный индекс googleId (user.schema.ts) пропустит запись
// только одному из них, второй обязан получить `null`, а не 500 или
// молчаливую перезапись чужой связки.
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import type { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';

export async function attachGoogleId(
  model: Model<UserRecord>,
  userId: string,
  googleId: string,
): Promise<UserLean | null> {
  try {
    const doc = await model
      .findOneAndUpdate(
        { _id: userId, googleId: { $exists: false } },
        { $set: { googleId } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc | null>();
    return doc ? toLean(doc) : null;
  } catch (err) {
    if (isDuplicateKeyError(err)) return null;
    throw err;
  }
}
