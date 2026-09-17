// PersonalChats настоящий (не фейк — CLAUDE.md «Тесты»: identity-проверки
// хендлеров идут против настоящей Mongo). С listFor() у PersonalChats появилась
// третья зависимость — NotificationPrefsService — общий сборщик, чтобы её не
// повторять в каждом test-support (jscpd, CLAUDE.md «Одна механика»).
// NotificationPrefsRecord уже зарегистрирован на соединении из openMemoryMongo
// (MODEL_DEFINITIONS) — модель просто берём по имени, без схемы повторно.
import type { Connection, Model } from 'mongoose';
import type { ChannelRecord } from '../../channels/channel.schema';
import { NotificationPrefsRecord } from '../../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import type { UsersService } from '../../users/users.service';
import { PersonalChats } from '../personal-chats';

export function buildPersonalChats(
  connection: Connection,
  usersService: UsersService,
  channelModel: Model<ChannelRecord>,
): PersonalChats {
  const notificationPrefsModel = connection.model<NotificationPrefsRecord>(
    NotificationPrefsRecord.name,
  );
  return new PersonalChats(
    usersService,
    channelModel,
    new NotificationPrefsService(notificationPrefsModel),
  );
}
