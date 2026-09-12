// Бот Telegram (ADR-0015): вебхук + авторегистрация чатов как каналов, кнопки
// предпросмотра/«Запись?»/ручных каналов, /тема, /уведомления (PLAN.md §6, §13).
// ChannelsModule — ChannelConfigService и модель ChannelRecord (TeacherChats);
// UsersModule — UsersService (/start, TeacherChats, MessageHandler);
// BroadcastsModule — BroadcastsService.cancel(), TopicRebuildService, модель
// BroadcastRecord; LessonsModule — LessonsService.update()/addRecording(),
// модель LessonRecord; DeliveriesModule — DeliveriesService.markSent();
// ClassesModule — модель ClassRecord (/тема, TopicCommandHandler);
// SettingsModule — SettingsService.get() (StartHandler, адрес сайта школы для
// незнакомца, В6 аудита); NotificationsModule — NotificationPrefsService
// (TeacherChats.listFor, кнопки «Уведомления»). Ни один из них не
// импортирует TelegramModule обратно — цикла нет (ADR-0013).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';
import { ChannelsModule } from '../channels/channels.module';
import { ClassesModule } from '../classes/classes.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { LessonsModule } from '../lessons/lessons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { BotSessionRecord, BotSessionSchema } from './bot-session.schema';
import { BotSessionService } from './bot-session.service';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { ChatMemberHandler } from './handlers/chat-member.handler';
import { MessageHandler } from './handlers/message.handler';
import { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import { StartHandler } from './handlers/start.handler';
import { TopicCommandHandler } from './handlers/topic-command.handler';
import { TeacherChats } from './teacher-chats';
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
    MessageHandler,
    TeacherChats,
    BotSessionService,
    { provide: TELEGRAF_FACTORY, useValue: createTelegraf },
  ],
  // TelegramBotService — SchedulerModule (проактивная отправка предпросмотра,
  // «Запись?», ручных каналов и уведомлений); TeacherChats/BotSessionService —
  // тот же вызывающий код (PreviewService/RecordingPromptService/
  // ManualPromptService/TelegramTeacherNotifier).
  exports: [TelegramBotService, TeacherChats, BotSessionService],
})
export class TelegramModule {}
