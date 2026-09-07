// Бот Telegram (ADR-0015): вебхук + авторегистрация чатов как каналов.
// ChannelsModule — ради ChannelConfigService (upsert/deactivate чата),
// UsersModule — ради UsersService.findByTelegramId в /start.
import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { UsersModule } from '../users/users.module';
import { ChatMemberHandler } from './handlers/chat-member.handler';
import { StartHandler } from './handlers/start.handler';
import { TELEGRAF_FACTORY, createTelegraf } from './telegraf-instance';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramController } from './telegram.controller';
import { TelegramWebhookGuard } from './telegram-webhook.guard';

@Module({
  imports: [ChannelsModule, UsersModule],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    TelegramWebhookGuard,
    ChatMemberHandler,
    StartHandler,
    { provide: TELEGRAF_FACTORY, useValue: createTelegraf },
  ],
})
export class TelegramModule {}
