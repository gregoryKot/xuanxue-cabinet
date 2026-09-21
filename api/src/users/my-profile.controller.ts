// PATCH /me/profile — человек называет себя сам на первом входе (ADR-0044,
// экран `/welcome`). Без @Roles: доступно любой роли, включая человека без
// единой роли (тот же приём, что у MyLessonsController — `/me/lessons`):
// имя себе называет каждый, кто вошёл, роль тут ни при чём, маршрут всё
// равно требует сессии (AuthGuard), не публичный.
import { Body, Controller, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MeDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import { toMeDto } from '../auth/user.mapper';
import type { UserLean } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserProfileService } from './user-profile.service';

@Controller('me/profile')
export class MyProfileController {
  constructor(
    private readonly userProfileService: UserProfileService,
    private readonly userBotChatStatusService: UserBotChatStatusService,
  ) {}

  // Возвращает MeDto — тот же, что GET /auth/me, тем же toMeDto() — не 204:
  // экран `/welcome` кладёт этот ответ прямо на себя вместо повторного
  // GET (ADR-0087, «Последствия»), при TTFB 0.5–1.1 с второй запрос стоил
  // лишнюю секунду на то же самое действие. `id` — ТОЛЬКО из сессии
  // (@CurrentUser()), никогда из тела или пути: SECURITY §2 требует, чтобы
  // маршрут `/me/*` скоупился по userId из сессии — иначе один человек мог
  // бы переписать имя другому, просто отправив чужой id.
  @Patch()
  @HttpCode(HttpStatus.OK)
  async update(
    @Body() body: UpdateMyProfileDto,
    @CurrentUser() user: UserLean,
  ): Promise<MeDto> {
    const updated = await this.userProfileService.setName(user.id, body, DateTime.utc());
    return toMeDto(
      updated,
      await this.userBotChatStatusService.hasActiveChatFor(updated),
    );
  }
}
