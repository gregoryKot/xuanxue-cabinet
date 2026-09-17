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
// ExamAttemptModelModule — тот же приём для модели попытки (её уже
// использует MediaModule ровно по этой причине, комментарий в
// exam-attempt-model.module.ts). ExamItemModelModule — тот же приём для
// модели вопроса банка: ExamImageSweepService (слой 4.2, ADR-0035) нужна она
// вместе с ExamAttemptModelModule, чтобы узнать, на какие картинки ещё
// ссылаются вопрос и попытка. ExamImagesModule — модель самой картинки
// (`exam_images`) и
// ExamImagesService (провайдер не отсюда, модуль его уже даёт). TelegramModule
// — TelegramBotService/PersonalChats/BotSessionService для проактивной
// отправки (предпросмотр, «Запись?», ручные каналы, уведомления об ошибках);
// ни TelegramModule, ни его собственные импорты про SchedulerModule не знают.
import { Module } from '@nestjs/common';
import { BroadcastCancelNotifyService } from '../broadcasts/broadcast-cancel-notify.service';
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
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { ExamDeadlineCloseService } from '../exams/exam-deadline-close.service';
import { ExamItemModelModule } from '../exams/exam-item-model.module';
import { EXAM_NOTIFIER } from '../exams/exam-notifier';
import { LessonPlannerService } from '../lessons/lesson-planner.service';
import { LessonsModule } from '../lessons/lessons.module';
import { RecordingPromptService } from '../lessons/recording-prompt.service';
import { SettingsModule } from '../settings/settings.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';
import { TelegramTeacherNotifier } from '../telegram/telegram-teacher-notifier';
import { UsersModule } from '../users/users.module';
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
    ExamImagesModule,
    // BroadcastPlannerService резолвит {ведущий} через UsersService — цикла
    // нет: UsersModule ни о SchedulerModule, ни о доменах школы не знает.
    UsersModule,
    TelegramModule,
  ],
  providers: [
    LessonPlannerService,
    BroadcastPlannerService,
    BroadcastCancelNotifyService,
    DeliveryRunnerService,
    PreviewService,
    RecordingPromptService,
    ManualPromptService,
    ExamDeadlineCloseService,
    ExamImageSweepService,
    // Только по токену — второй провайдер класса без токена (было раньше)
    // создавал второй экземпляр TelegramTeacherNotifier с собственным
    // Map-дедупом notifySchedulerFailed, никем не используемый.
    { provide: TEACHER_NOTIFIER, useClass: TelegramTeacherNotifier },
    // Свой экземпляр EXAM_NOTIFIER (безопасно — см. комментарий-шапку файла
    // exam-deadline-close.service.ts): TelegramExamNotifier читает Mongo на
    // каждый вызов, дедуп-состояния между инстансами нет.
    { provide: EXAM_NOTIFIER, useClass: TelegramExamNotifier },
    SchedulerService,
  ],
})
export class SchedulerModule {}
