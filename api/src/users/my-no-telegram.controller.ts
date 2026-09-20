// PUT /me/no-telegram — человек ставит или снимает «у меня нет Telegram»
// (ADR-0067). Без @Roles: доступно любой роли, включая человека без единой
// роли (тот же приём, что у MyProfileController — `/me/profile`): отметку
// ставит себе каждый, кто вошёл, роль тут ни при чём, маршрут всё равно
// требует сессии (AuthGuard), не публичный.
import { Body, Controller, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from './users.service';
import { SetNoTelegramDto } from './dto/set-no-telegram.dto';
import { UserNoTelegramService } from './user-no-telegram.service';

@Controller('me/no-telegram')
export class MyNoTelegramController {
  constructor(private readonly userNoTelegramService: UserNoTelegramService) {}

  // 204, не обновлённый MeDto: фронт после этого сам перечитывает
  // GET /auth/me, где и считается botChatActive — тот же приём, что у
  // MyProfileController (ADR-0044). `id` — ТОЛЬКО из сессии (@CurrentUser()),
  // никогда из тела или пути: SECURITY §2 требует, чтобы маршрут `/me/*`
  // скоупился по userId из сессии — иначе один человек мог бы поставить
  // отметку другому, просто отправив чужой id. PUT, а не POST: отметка —
  // идемпотентная установка значения, повтор ничего не ломает (CLAUDE.md
  // «API»).
  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body() body: SetNoTelegramDto,
    @CurrentUser() user: UserLean,
  ): Promise<void> {
    await this.userNoTelegramService.setNoTelegram(
      user.id,
      body.noTelegram,
      DateTime.utc(),
    );
  }
}
