// Есть ли у человека активный личный канал type=telegram (общая механика для
// PersonalChats.hasActiveChatFor, api/src/telegram/, и MeDto.botChatActive у
// PATCH /me/profile / PUT /me/no-telegram, api/src/users/) — вынесена в
// отдельный файл, а не продублирована: UsersModule не может импортировать
// TelegramModule ради PersonalChats (TelegramModule сам импортирует
// UsersModule — граф Nest закольцевался бы, ADR-0013 явно отказывается от
// forwardRef). Функция берёт только модель ChannelRecord — UsersModule
// получает её через уже существующий ChannelModelModule (channel-model.module.ts),
// тем же приёмом, что LessonModelModule/UserModelModule/ExamAttemptModelModule.
import type { Model } from 'mongoose';
import type { UserLean } from '../users/users.service';
import type { ChannelRecord } from './channel.schema';

/** Статус `active` обязателен (SECURITY §9, ADR-0026, ADR-0036) —
 * заблокированному человеку бот писать не должен, даже если у него остался
 * активный канал с прошлого раза. */
export async function hasActiveTelegramChat(
  channelModel: Model<ChannelRecord>,
  user: UserLean | null,
): Promise<boolean> {
  if (!user?.telegramId || user.status !== 'active') return false;

  const channel = await channelModel
    .findOne(
      { type: 'telegram', target: String(user.telegramId), active: true },
      { _id: 1 },
    )
    .lean();
  return !!channel;
}
