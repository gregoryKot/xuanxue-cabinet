// Вебхук Telegram (SECURITY §2, ADR-0015). @Public() — сессии cookie тут
// нет и не будет, подлинность подтверждает secret_token; @SkipCsrf() —
// Telegram не пришлёт x-requested-with; TelegramWebhookGuard — сам
// secret_token, выполняется уже после глобального AuthGuard/ThrottlerGuard
// (по IP, идентичность неверифицированная — CLAUDE.md №4).
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Update } from 'telegraf/types';
import { Public, SkipCsrf } from '../auth/auth.decorators';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramWebhookGuard } from './telegram-webhook.guard';

// Весь трафик Telegram идёт с небольшого пула собственных IP (не по одному
// на чат/пользователя) — общий глобальный лимит 120/мин на IP (CLAUDE.md №4)
// душил бы апдейты чужих, никак не связанных между собой чатов школы разом.
// Свой явный, заметно более высокий потолок на этот один маршрут.
const TELEGRAM_WEBHOOK_THROTTLE = { default: { limit: 300, ttl: 60_000 } };

@Controller('telegram')
export class TelegramController {
  constructor(private readonly bot: TelegramBotService) {}

  // Ответ 200 всегда, даже если обработка апдейта внутри упала — Telegram
  // ретраит при не-200 и плодит дубли (CLAUDE.md «Telegram»); сам
  // try/catch — в TelegramBotService.handleUpdate().
  @Public()
  @SkipCsrf()
  @Throttle(TELEGRAM_WEBHOOK_THROTTLE)
  @UseGuards(TelegramWebhookGuard)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() body: Record<string, unknown>): Promise<void> {
    await this.bot.handleUpdate(body as unknown as Update);
  }
}
