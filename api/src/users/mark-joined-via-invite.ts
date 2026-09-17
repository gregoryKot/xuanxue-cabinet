// Пометка входа по ссылке-приглашения школы (ADR-0030, login-identity.service.ts)
// — число «По ссылке пришли» на «Людях» строится по этому полю. Вынесено из
// users.service.ts отдельным файлом тем же приёмом, что upsert-user-by-key.ts:
// сервис остаётся в пределах 150 строк (file-size-ratchet, ревью владельца
// 2026-09-15). Время — параметром (CLAUDE.md «Время»), не Date.now().
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { UserRecord } from './user.schema';

export async function markJoinedViaInvite(
  model: Model<UserRecord>,
  id: string,
  now: DateTime,
): Promise<void> {
  await model.updateOne({ _id: id }, { $set: { joinedViaInviteAt: now.toJSDate() } });
}
