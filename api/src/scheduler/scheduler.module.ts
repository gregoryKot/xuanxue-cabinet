// ClassesModule берёт модель занятий из LessonModelModule (не из
// LessonsModule — так и разорван цикл, см. lesson-model.module.ts),
// LessonsModule зависит от ClassesModule ради модели класса. Планировщику
// нужны обе модели — SchedulerModule импортирует оба домена напрямую; ни
// ClassesModule, ни LessonsModule про SchedulerModule не знают — цикла нет.
// BroadcastPlannerService/BroadcastCancelNotifyService/DeliveryRunnerService/
// PreviewService/RecordingPromptService/ManualPromptService/
// ExamDeadlineCloseService живут физически в своих доменах (broadcasts/,
// deliveries/, lessons/, exams/), но провайдер — здесь: тот же приём, что уже
// был с LessonPlannerService (ADR-0013 «Отдельный модуль модели разрывает
// цикл»). BroadcastCancelNotifyService именно поэтому здесь, а не провайдером
// BroadcastsModule: ему нужен TEACHER_NOTIFIER (TelegramModule), а
// BroadcastsModule не может импортировать TelegramModule — тот сам
// импортирует BroadcastsModule (цикл). Тот же довод — для
// ExamDeadlineCloseService и EXAM_NOTIFIER: ExamsModule сам импортирует
// TelegramModule (EXAM_NOTIFIER собран там), импорт ExamsModule сюда потянул
// бы весь его граф (контроллеры, MediaModule) ради одного сервиса.
// BroadcastsModule/DeliveriesModule/ChannelsModule/SettingsModule — модельные
// модули (только forFeature), сама логика тика собирается на этом уровне;
// ExamAttemptModelModule — тот же приём для модели попытки (её уже использует
// MediaModule ровно по этой причине, комментарий в exam-attempt-model.module.ts).
// ExamItemModelModule — тот же приём для модели вопроса банка: уборщикам
// картинок (ExamImageSweepService, ADR-0035) и видео (ExamVideoSweepService,
// ADR-0133) нужно знать, на что ещё ссылаются вопрос и попытка. ExamImagesModule/
// ExamVideosModule — модель самой картинки/видео (`exam_images`/`exam_videos`),
// StorageOrphansService уже внутри ExamVideosModule.
// TelegramModule — TelegramBotService/PersonalChats/BotSessionService для
// проактивной отправки (предпросмотр, «Запись?», ручные каналы, уведомления об
// ошибках); он и его импорты про SchedulerModule не знают.
// NotificationsModule — ради InAppExamNotifier (ADR-0061, тот же приём, что в
// exams.module.ts): у ExamDeadlineCloseService свой экземпляр EXAM_NOTIFIER, и
// строка в ленте кабинета не должна зависеть от того, каким путём попытка
// закрылась (явным submit или ленивым дедлайном). PushModule — тем же доводом,
// третье плечо (PushExamNotifier, ADR-0092). Модель NotificationRecord оттуда же
// нужна ExamAttemptRetentionSweepService (ADR-0153).
import { Module } from '@nestjs/common';
import { AnswerVideosModule } from '../answer-videos/answer-videos.module';
import { BroadcastCancelNotifyService } from '../broadcasts/broadcast-cancel-notify.service';
import { SCHEDULER_HEARTBEAT } from '../common/scheduler-heartbeat';
import { BroadcastPlannerService } from '../broadcasts/broadcast-planner.service';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';
import { PreviewService } from '../broadcasts/preview.service';
import { ChannelsModule } from '../channels/channels.module';
import { ClassesModule } from '../classes/classes.module';
import { TEACHER_NOTIFIER } from '../deliveries/teacher-notifier';
import { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { ManualPromptService } from '../deliveries/manual-prompt.service';
import { ExamImageSweepService } from '../exam-images/exam-image-sweep.service';
import { ExamImagesModule } from '../exam-images/exam-images.module';
import { ExamVideoSweepService } from '../exam-videos/exam-video-sweep.service';
import { ExamVideosModule } from '../exam-videos/exam-videos.module';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { ExamAttemptRetentionSweepService } from '../exams/exam-attempt-retention-sweep.service';
import { ExamDeadlineCloseService } from '../exams/exam-deadline-close.service';
import { ExamGradingModelModule } from '../exams/exam-grading-model.module';
import { ExamItemModelModule } from '../exams/exam-item-model.module';
import { CompositeExamNotifier } from '../exams/exam-notifier.composite';
import { EXAM_NOTIFIER } from '../exams/exam-notifier';
import { LessonPlannerService } from '../lessons/lesson-planner.service';
import { LessonReminderService } from '../lessons/lesson-reminder.service';
import { LessonsModule } from '../lessons/lessons.module';
import { MediaModule } from '../media/media.module';
import { RecordingPromptService } from '../lessons/recording-prompt.service';
import { InAppExamNotifier } from '../notifications/in-app-exam-notifier';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentReminderService } from '../payments/payment-reminder.service';
import { PaymentScreenshotSweepService } from '../payments/payment-screenshot-sweep.service';
import { PaymentsModule } from '../payments/payments.module';
import { PushExamNotifier } from '../push/push-exam-notifier';
import { PushModule } from '../push/push.module';
import { SettingsModule } from '../settings/settings.module';
// StorageModule — ради StorageOrphansService: шаг «файлы-сироты» (ADR-0079).
// Хранилище о планировщике не знает, цикла нет.
import { StorageModule } from '../storage/storage.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';
import { TelegramTeacherNotifier } from '../telegram/telegram-teacher-notifier';
import { UserModelModule } from '../users/user-model.module';
import { UsersModule } from '../users/users.module';
import { SchedulerHeartbeat } from './scheduler-heartbeat';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ClassesModule,
    LessonsModule,
    ChannelsModule,
    BroadcastsModule,
    DeliveriesModule,
    SettingsModule,
    ExamAttemptModelModule,
    ExamItemModelModule,
    // Модели оценки и media_assets — ExamAttemptRetentionSweepService (ADR-0153).
    ExamGradingModelModule,
    MediaModule,
    ExamImagesModule,
    ExamVideosModule,
    // AnswerVideosModule — AnswerVideoSweepService (ADR-0137) провайдер этого
    // модуля; он про SchedulerModule не знает — цикла нет.
    AnswerVideosModule,
    NotificationsModule,
    PushModule,
    // Модели `payments`/`payment_screenshots` — шаги «скриншоты оплат»
    // (ADR-0050) и «напоминания об оплате» (ADR-0150); провайдеры ниже.
    PaymentsModule,
    StorageModule,
    // BroadcastPlannerService резолвит {ведущий} через UsersService — цикла
    // нет: UsersModule ни о SchedulerModule, ни о доменах школы не знает.
    UsersModule,
    UserModelModule, // UserRecord для LessonReminderService (ADR-0135)
    TelegramModule,
  ],
  providers: [
    LessonPlannerService,
    BroadcastPlannerService,
    BroadcastCancelNotifyService,
    DeliveryRunnerService,
    PreviewService,
    RecordingPromptService,
    LessonReminderService, // напоминание ученикам о занятии (ADR-0135)
    ManualPromptService,
    ExamDeadlineCloseService,
    PaymentReminderService, // напоминание ученикам об оплате (ADR-0150)
    ExamImageSweepService,
    ExamVideoSweepService,
    ExamAttemptRetentionSweepService, // срок хранения попыток (ADR-0153)
    PaymentScreenshotSweepService,
    // Только по токену — второй провайдер класса без токена (было раньше)
    // создавал второй экземпляр TelegramTeacherNotifier с собственным
    // Map-дедупом notifySchedulerFailed, никем не используемый.
    { provide: TEACHER_NOTIFIER, useClass: TelegramTeacherNotifier },
    // Свой экземпляр EXAM_NOTIFIER (безопасно — см. комментарий-шапку файла
    // exam-deadline-close.service.ts): InAppExamNotifier/TelegramExamNotifier/
    // PushExamNotifier читают Mongo на каждый вызов, дедуп-состояния между
    // инстансами нет.
    InAppExamNotifier,
    TelegramExamNotifier,
    PushExamNotifier,
    { provide: EXAM_NOTIFIER, useClass: CompositeExamNotifier },
    SchedulerHeartbeat,
    // Тот же синглтон под токеном — HealthController (AppModule, common/
    // scheduler-heartbeat.ts) не может импортировать SchedulerModule целиком
    // ради одного показателя (аудит 2026-09-21, MED): useExisting не создаёт
    // второй экземпляр, SchedulerService видит те же noteTickStarted/Finished.
    { provide: SCHEDULER_HEARTBEAT, useExisting: SchedulerHeartbeat },
    SchedulerService,
  ],
  exports: [SCHEDULER_HEARTBEAT],
})
export class SchedulerModule {}
