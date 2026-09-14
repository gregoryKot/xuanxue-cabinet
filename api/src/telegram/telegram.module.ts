// Бот Telegram (ADR-0015): вебхук + авторегистрация чатов как каналов, кнопки
// предпросмотра/«Запись?»/ручных каналов, /тема, /уведомления (PLAN.md §6, §13).
// ChannelsModule — ChannelConfigService и модель ChannelRecord (PersonalChats);
// UsersModule — UsersService (/start, PersonalChats, MessageHandler);
// BroadcastsModule — BroadcastsService.cancel(), TopicRebuildService, модель
// BroadcastRecord; LessonsModule — LessonsService.update()/addRecording(),
// модель LessonRecord; DeliveriesModule — DeliveriesService.markSent();
// ClassesModule — модель ClassRecord (/тема, TopicCommandHandler);
// SettingsModule — SettingsService.get() (StartHandler, адрес сайта школы для
// незнакомца, В6 аудита); NotificationsModule — NotificationPrefsService
// (PersonalChats.listFor, кнопки «Уведомления»); MediaModule —
// MediaAssetsService (ExamMediaMessageHandler, слой 4.5, ADR-0023): бот
// привязывает видео экзамена и пересылает его учителю. Ни один из них не
// импортирует TelegramModule обратно — цикла нет (ADR-0013). MediaModule в
// частности берёт модель ExamAttemptRecord через ExamAttemptModelModule
// (api/src/exams/), не через ExamsModule — тот сам импортирует TelegramModule
// (EXAM_NOTIFIER, слой 4.7) и импорт в обратную сторону закольцевал бы граф.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';
import { ChannelsModule } from '../channels/channels.module';
import { ClassesModule } from '../classes/classes.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { LessonsModule } from '../lessons/lessons.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { BotSessionRecord, BotSessionSchema } from './bot-session.schema';
import { BotSessionService } from './bot-session.service';
import { ExamBotPortRegistry } from './exam-bot-port.registry';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { ChatMemberHandler } from './handlers/chat-member.handler';
import { ExamCommandHandler } from './handlers/exam-command.handler';
import { ExamMediaMessageHandler } from './handlers/exam-media-message.handler';
import { ExamTextAnswerHandler } from './handlers/exam-text-answer.handler';
import { MessageHandler } from './handlers/message.handler';
import { MenuCommandHandler } from './handlers/menu-command.handler';
import { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import { RecordingWaitHandler } from './handlers/recording-wait.handler';
import { StartHandler } from './handlers/start.handler';
import { TopicCommandHandler } from './handlers/topic-command.handler';
import { PersonalChats } from './personal-chats';
import { TELEGRAF_FACTORY, createTelegraf } from './telegraf-instance';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramController } from './telegram.controller';
import { TelegramWebhookGuard } from './telegram-webhook.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotSessionRecord.name, schema: BotSessionSchema },
    ]),
    ChannelsModule,
    UsersModule,
    BroadcastsModule,
    LessonsModule,
    DeliveriesModule,
    ClassesModule,
    SettingsModule,
    NotificationsModule,
    MediaModule,
  ],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    TelegramWebhookGuard,
    ChatMemberHandler,
    StartHandler,
    CallbackQueryHandler,
    TopicCommandHandler,
    NotificationsCommandHandler,
    MenuCommandHandler,
    MessageHandler,
    RecordingWaitHandler,
    ExamMediaMessageHandler,
    ExamTextAnswerHandler,
    ExamCommandHandler,
    ExamBotPortRegistry,
    PersonalChats,
    BotSessionService,
    { provide: TELEGRAF_FACTORY, useValue: createTelegraf },
  ],
  // TelegramBotService — SchedulerModule (проактивная отправка предпросмотра,
  // «Запись?», ручных каналов и уведомлений); PersonalChats/BotSessionService —
  // тот же вызывающий код (PreviewService/RecordingPromptService/
  // ManualPromptService/TelegramTeacherNotifier).
  // ExamBotPortRegistry — наружу: ExamsModule кладёт в него реализацию
  // ExamBotPort (exams/exam-bot.service.ts), импортировать exams/ отсюда
  // нельзя (цикл, см. комментарий в exam-bot-port.registry.ts).
  exports: [TelegramBotService, PersonalChats, BotSessionService, ExamBotPortRegistry],
})
export class TelegramModule {}
