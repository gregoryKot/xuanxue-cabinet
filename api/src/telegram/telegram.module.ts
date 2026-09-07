// Бот Telegram (ADR-0015): вебхук + авторегистрация чатов как каналов, кнопки
// предпросмотра «Отменить»/«Изменить тему» (PLAN.md §6). ChannelsModule —
// ChannelConfigService и модель ChannelRecord (TeacherChats); UsersModule —
// UsersService (/start, TeacherChats, MessageHandler); BroadcastsModule —
// BroadcastsService.cancel(), TopicRebuildService, модель BroadcastRecord;
// LessonsModule — LessonsService.update() (тема из бота). Ни один из них не
// импортирует TelegramModule обратно — цикла нет (ADR-0013).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';
import { ChannelsModule } from '../channels/channels.module';
import { LessonsModule } from '../lessons/lessons.module';
import { UsersModule } from '../users/users.module';
import { BotSessionRecord, BotSessionSchema } from './bot-session.schema';
import { BotSessionService } from './bot-session.service';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { ChatMemberHandler } from './handlers/chat-member.handler';
import { MessageHandler } from './handlers/message.handler';
import { StartHandler } from './handlers/start.handler';
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
  ],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    TelegramWebhookGuard,
    ChatMemberHandler,
    StartHandler,
    CallbackQueryHandler,
    MessageHandler,
    TeacherChats,
    BotSessionService,
    { provide: TELEGRAF_FACTORY, useValue: createTelegraf },
  ],
  // TelegramBotService — SchedulerModule (проактивная отправка предпросмотра
  // и уведомлений); TeacherChats — тот же вызывающий код.
  exports: [TelegramBotService, TeacherChats],
})
export class TelegramModule {}
