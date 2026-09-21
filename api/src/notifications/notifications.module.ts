// Модуль уведомлений (ТЗ notifications-api.md) — типы, дефолты по роли,
// настройка (NotificationPrefsService/Controller) и лента кабинета
// (InboxService/Controller, `/me/inbox`, слой in-app уведомлений, ADR-0061).
// NotificationRecord регистрируется здесь и экспортируется через
// MongooseModule — ExamsModule, который уже импортирует этот модуль ради
// NotificationPrefsService, собирает им же InAppExamNotifier
// (in-app-exam-notifier.ts, провайдер ExamsModule, не этого модуля — тот же
// приём, что у TelegramExamNotifier, комментарий в exams.module.ts).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { NotificationPrefsController } from './notification-prefs.controller';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from './notification-prefs.schema';
import { NotificationPrefsService } from './notification-prefs.service';
import { NotificationRecord, NotificationSchema } from './notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationPrefsRecord.name, schema: NotificationPrefsSchema },
      { name: NotificationRecord.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationPrefsController, InboxController],
  providers: [NotificationPrefsService, InboxService],
  exports: [MongooseModule, NotificationPrefsService],
})
export class NotificationsModule {}
