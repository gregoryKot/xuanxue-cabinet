// Модуль уведомлений (ТЗ notifications-api.md) — типы, дефолты по роли,
// настройка (NotificationPrefsService/Controller) и лента кабинета
// (InboxService/Controller, `/me/inbox`, слой in-app уведомлений, ADR-0061),
// выбор «о каких занятиях» (LessonScopeService, LessonNotificationsController,
// `/me/notifications/lessons`, ADR-0162) и получатели шагов тика о занятии
// (LessonRecipientsService).
// NotificationRecord регистрируется здесь и экспортируется через
// MongooseModule — ExamsModule, который уже импортирует этот модуль ради
// NotificationPrefsService, собирает им же InAppExamNotifier
// (in-app-exam-notifier.ts, провайдер ExamsModule, не этого модуля — тот же
// приём, что у TelegramExamNotifier, комментарий в exams.module.ts).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClassesModule } from '../classes/classes.module';
import { SettingsModule } from '../settings/settings.module';
import { UserModelModule } from '../users/user-model.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { LessonNotificationsController } from './lesson-notifications.controller';
import { LessonNotificationsService } from './lesson-notifications.service';
import { LessonRecipientsService } from './lesson-recipients.service';
import { LessonScopeService } from './lesson-scope.service';
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
    // Модель ClassRecord — список занятий для выбора «о каких» (ADR-0162).
    // Цикла нет: ClassesModule про уведомления не знает.
    ClassesModule,
    // Школьное «за сколько минут» рядом с личным (SettingsService.get()).
    // Цикла нет: SettingsModule про уведомления не знает.
    SettingsModule,
    // Модель пользователя — активные ученики для LessonRecipientsService.
    // Цикла нет: UserModelModule только регистрирует модель.
    UserModelModule,
  ],
  controllers: [
    NotificationPrefsController,
    LessonNotificationsController,
    InboxController,
  ],
  providers: [
    NotificationPrefsService,
    LessonScopeService,
    LessonRecipientsService,
    LessonNotificationsService,
    InboxService,
  ],
  // LessonRecipientsService — шагам тика о занятии (LessonReminderService,
  // LessonCancelNoticeService, провайдеры SchedulerModule): получатели и их
  // выбор занятий одной выборкой на пачку учеников.
  exports: [MongooseModule, NotificationPrefsService, LessonRecipientsService],
})
export class NotificationsModule {}
