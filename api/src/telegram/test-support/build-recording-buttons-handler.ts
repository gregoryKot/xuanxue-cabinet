// Настоящий RecordingButtonsHandler для спеков кнопок бота
// (callback-query.handler.*.spec.ts): «Записи не будет» и «К какому занятию?»
// читают занятия и bot_sessions из настоящей Mongo (CLAUDE.md «Тесты»).
// LessonsService со всеми зависимостями собирается здесь один раз. Модели уже
// зарегистрированы на соединении из openMemoryMongo (MODEL_DEFINITIONS) —
// берутся по имени, как в build-personal-chats.ts.
import type { Connection } from 'mongoose';
import { BroadcastModels } from '../../broadcasts/broadcast-models.provider';
import { BroadcastRecord } from '../../broadcasts/broadcast.schema';
import { LessonLinkRebuildService } from '../../broadcasts/lesson-link-rebuild.service';
import { RecordingBroadcastService } from '../../broadcasts/recording-broadcast.service';
import { ChannelRecord } from '../../channels/channel.schema';
import { ClassRecord } from '../../classes/class.schema';
import { DeliveryRecord } from '../../deliveries/delivery.schema';
import { LessonRecord } from '../../lessons/lesson.schema';
import { LessonsService } from '../../lessons/lessons.service';
import { MaterialRecord } from '../../materials/material.schema';
import { SettingsRecord } from '../../settings/settings.schema';
import { SettingsService } from '../../settings/settings.service';
import { UserRecord } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import { RecordingButtonsHandler } from '../handlers/recording-buttons.handler';
import { RecordingWaitHandler } from '../handlers/recording-wait.handler';

export function buildRecordingButtonsHandler(
  connection: Connection,
  botSessions: BotSessionService,
): RecordingButtonsHandler {
  const lessonModel = connection.model<LessonRecord>(LessonRecord.name);
  const classModel = connection.model<ClassRecord>(ClassRecord.name);
  const broadcastModel = connection.model<BroadcastRecord>(BroadcastRecord.name);
  const userModel = connection.model<UserRecord>(UserRecord.name);
  const usersService = new UsersService(userModel);
  const broadcastModels = new BroadcastModels(
    lessonModel,
    classModel,
    connection.model<ChannelRecord>(ChannelRecord.name),
    broadcastModel,
    connection.model<DeliveryRecord>(DeliveryRecord.name),
  );
  const settings = new SettingsService(
    connection.model<SettingsRecord>(SettingsRecord.name),
    lessonModel,
    classModel,
    usersService,
  );
  const lessonsService = new LessonsService(
    lessonModel,
    classModel,
    new RecordingBroadcastService(broadcastModels, settings, usersService),
    new LessonLinkRebuildService(broadcastModels, settings, usersService),
    broadcastModel,
    userModel,
    connection.model<MaterialRecord>(MaterialRecord.name),
  );
  const recordingWait = new RecordingWaitHandler(
    botSessions,
    lessonsService,
    broadcastModel,
    classModel,
    lessonModel,
  );
  return new RecordingButtonsHandler(botSessions, recordingWait, lessonModel);
}
