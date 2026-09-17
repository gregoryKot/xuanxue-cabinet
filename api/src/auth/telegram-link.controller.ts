// Выпуск кода связки Telegram (ADR-0034) — отдельный файл, не метод в
// AuthController: тот уже у потолка 150 строк (file-size-ratchet), тот же
// приём, что у JoinController (см. комментарий в join.controller.ts).
// Провайдер TelegramLinkCodeService приходит как экспорт UsersModule
// (импортирован в auth.module.ts), второй раз здесь не заводим.
import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import type { TelegramLinkCodeDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { TelegramLinkCodeService } from '../users/telegram-link-code.service';
import { CurrentUser } from './auth.decorators';

// Без @Public: код связки выпускается только вошедшей сессии — гвард сам
// отсекает `blocked` (SECURITY §2), других статусов у человека нет
// (ADR-0034, ADR-0035). Тот же профиль лимита, что у issue-эндпоинтов входа
// (join/check и др.).
const TELEGRAM_LINK_CODE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class TelegramLinkController {
  constructor(private readonly linkCodeService: TelegramLinkCodeService) {}

  @Throttle(TELEGRAM_LINK_CODE_THROTTLE)
  @Post('telegram/link-code')
  @HttpCode(HttpStatus.OK)
  async issueLinkCode(@CurrentUser() user: UserLean): Promise<TelegramLinkCodeDto> {
    return this.linkCodeService.issueLink(user.id, DateTime.utc());
  }
}
