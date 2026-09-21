// PUT /me/no-telegram — человек ставит или снимает «у меня нет Telegram»
// (ADR-0067). Без @Roles: доступно любой роли, включая человека без единой
// роли (тот же приём, что у MyProfileController — `/me/profile`): отметку
// ставит себе каждый, кто вошёл, роль тут ни при чём, маршрут всё равно
// требует сессии (AuthGuard), не публичный.
import { Body, Controller, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MeDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import { toMeDto } from '../auth/user.mapper';
import type { UserLean } from './users.service';
import { SetNoTelegramDto } from './dto/set-no-telegram.dto';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserNoTelegramService } from './user-no-telegram.service';

@Controller('me/no-telegram')
export class MyNoTelegramController {
  constructor(
    private readonly userNoTelegramService: UserNoTelegramService,
    private readonly userBotChatStatusService: UserBotChatStatusService,
  ) {}

  // Возвращает MeDto — тот же, что GET /auth/me, тем же toMeDto() — не 204:
  // экран профиля кладёт этот ответ прямо на себя вместо повторного GET
  // (ADR-0087, «Последствия»), тот же приём, что у MyProfileController.
  // `id` — ТОЛЬКО из сессии (@CurrentUser()), никогда из тела или пути:
  // SECURITY §2 требует, чтобы маршрут `/me/*` скоупился по userId из сессии
  // — иначе один человек мог бы поставить отметку другому, просто отправив
  // чужой id. PUT, а не POST: отметка — идемпотентная установка значения,
  // повтор ничего не ломает (CLAUDE.md «API»).
  @Put()
  @HttpCode(HttpStatus.OK)
  async update(
    @Body() body: SetNoTelegramDto,
    @CurrentUser() user: UserLean,
  ): Promise<MeDto> {
    const updated = await this.userNoTelegramService.setNoTelegram(
      user.id,
      body.noTelegram,
      DateTime.utc(),
    );
    return toMeDto(
      updated,
      await this.userBotChatStatusService.hasActiveChatFor(updated),
    );
  }
}
