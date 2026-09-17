// Отдельный модуль без импортов (комментарий в bot-identity.service.ts) —
// и TelegramModule, и UsersModule импортируют его напрямую, не друг друга.
import { Module } from '@nestjs/common';
import { BotIdentityService } from './bot-identity.service';

@Module({
  providers: [BotIdentityService],
  exports: [BotIdentityService],
})
export class BotIdentityModule {}
