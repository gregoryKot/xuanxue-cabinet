// PATCH /me/profile — человек называет себя сам на первом входе (ADR-0044,
// экран `/welcome`). Без @Roles: доступно любой роли, включая человека без
// единой роли (тот же приём, что у MyLessonsController — `/me/lessons`):
// имя себе называет каждый, кто вошёл, роль тут ни при чём, маршрут всё
// равно требует сессии (AuthGuard), не публичный.
import { Body, Controller, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UserProfileService } from './user-profile.service';

@Controller('me/profile')
export class MyProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  // 204, не обновлённый MeDto: фронт после этого сам перечитывает
  // GET /auth/me, где и считается botChatActive — второй маппер того же
  // ответа здесь не нужен (ADR-0044). `id` — ТОЛЬКО из сессии
  // (@CurrentUser()), никогда из тела или пути: SECURITY §2 требует, чтобы
  // маршрут `/me/*` скоупился по userId из сессии — иначе один человек мог
  // бы переписать имя другому, просто отправив чужой id.
  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body() body: UpdateMyProfileDto,
    @CurrentUser() user: UserLean,
  ): Promise<void> {
    await this.userProfileService.setName(user.id, body, DateTime.utc());
  }
}
