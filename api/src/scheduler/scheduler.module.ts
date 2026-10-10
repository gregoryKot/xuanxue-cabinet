// ClassesModule берёт модель занятий из LessonModelModule (не из LessonsModule —
// так разорван цикл, lesson-model.module.ts), LessonsModule зависит от
// ClassesModule ради модели класса. Планировщику нужны обе модели, поэтому
// SchedulerModule импортирует оба домена напрямую; они про него не знают.
// Сервисы шагов тика (рассылки, доставка, предпросмотр, «Запись?», ручные каналы,
// дедлайны экзаменов, отмена, запись и материал ученикам) живут в своих доменах,
// но провайдер — здесь: тот же приём, что с LessonPlannerService (ADR-0013
// «Отдельный модуль модели разрывает цикл»). BroadcastCancelNotifyService именно
// поэтому здесь, а не в BroadcastsModule: ему нужен TEACHER_NOTIFIER (TelegramModule),
// а BroadcastsModule не может импортировать TelegramModule — тот сам импортирует
// BroadcastsModule (цикл). Тот же довод — для ExamDeadlineCloseService и
// EXAM_NOTIFIER: ExamsModule сам импортирует TelegramModule (EXAM_NOTIFIER собран
// там), его граф (контроллеры, MediaModule) ради одного сервиса не нужен.
// BroadcastsModule/DeliveriesModule/ChannelsModule/SettingsModule — модельные
// модули (только forFeature), сама логика тика собирается на этом уровне;
// ExamAttemptModelModule — тот же приём для модели попытки (её уже использует
// MediaModule, exam-attempt-model.module.ts). ExamItemModelModule — модель
// вопроса банка: уборщикам картинок (ADR-0035) и видео (ADR-0133) нужно знать, на
// что ещё ссылаются вопрос и попытка. ExamImagesModule/ExamVideosModule — модель
// самой картинки/видео (`exam_images`/`exam_videos`), StorageOrphansService уже
// внутри ExamVideosModule.
// TelegramModule — TelegramBotService/PersonalChats/BotSessionService для
// проактивной отправки (предпросмотр, «Запись?», ручные каналы, уведомления об
// ошибках); он и его импорты про SchedulerModule не знают.
// NotificationsModule — ради InAppExamNotifier (ADR-0061, как в exams.module.ts):
// у ExamDeadlineCloseService свой EXAM_NOTIFIER, и строка в ленте не должна
// зависеть от того, каким путём попытка закрылась (submit или ленивый дедлайн).
// PushModule — тем же доводом, третье плечо (PushExamNotifier, ADR-0092). Модель
// NotificationRecord оттуда же нужна ExamAttemptRetentionSweepService (ADR-0153).
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
import { LessonVideosModule } from '../lesson-videos/lesson-videos.module';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { ExamAttemptRetentionSweepService } from '../exams/exam-attempt-retention-sweep.service';
import { ExamDeadlineCloseService } from '../exams/exam-deadline-close.service';
import { ExamGradingModelModule } from '../exams/exam-grading-model.module';
import { ExamItemModelModule } from '../exams/exam-item-model.module';
import { CompositeExamNotifier } from '../exams/exam-notifier.composite';
import { EXAM_NOTIFIER } from '../exams/exam-notifier';
import { LessonCancelNoticeService } from '../lessons/lesson-cancel-notice.service';
import { LessonPlannerService } from '../lessons/lesson-planner.service';
import { LessonReminderService } from '../lessons/lesson-reminder.service';
import { LessonsModule } from '../lessons/lessons.module';
import { MaterialModelModule } from '../materials/material-model.module';
import { MaterialNewNoticeService } from '../materials/material-new-notice.service';
import { MediaModule } from '../media/media.module';
import { RecordingPromptService } from '../lessons/recording-prompt.service';
import { RecordingReadyNoticeService } from '../lessons/recording-ready-notice.service';
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
import { VideoUploadsModule } from '../video-uploads/video-uploads.module';
import { VideoOrphansSweepService } from './video-orphans-sweep.service';
import { SchedulerHeartbeat } from './scheduler-heartbeat';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ClassesModule,
    LessonsModule,
    MaterialModelModule, // модель материала — MaterialNewNoticeService (ADR-0162)
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
    LessonVideosModule, // LessonVideoSweepService — шаг «видео-сироты» (ADR-0180)
    // AnswerVideoSweepService (ADR-0137) — провайдер этого модуля, цикла нет.
    AnswerVideosModule,
    NotificationsModule,
    PushModule,
    // Модели `payments`/`payment_screenshots` — шаги оплат (ADR-0050, ADR-0150).
    PaymentsModule,
    StorageModule,
    // ExamVideoSweepService (ADR-0165) убирает брошенные загрузки общим ядром.
    VideoUploadsModule,
    // BroadcastPlannerService резолвит {ведущий} через UsersService — цикла
    // нет: UsersModule ни о SchedulerModule, ни о доменах школы не знает.
    UsersModule,
    UserModelModule, // UserRecord для PaymentReminderService (ADR-0150)
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
    LessonCancelNoticeService, // отмена занятия ученикам (ADR-0162)
    RecordingReadyNoticeService, // запись занятия ученикам (ADR-0162)
    MaterialNewNoticeService, // новый материал ученикам (ADR-0162)
    ManualPromptService,
    ExamDeadlineCloseService,
    PaymentReminderService, // напоминание ученикам об оплате (ADR-0150)
    ExamImageSweepService,
    ExamVideoSweepService,
    VideoOrphansSweepService, // один шаг «видео-сироты» на все виды видео (ADR-0180)
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
