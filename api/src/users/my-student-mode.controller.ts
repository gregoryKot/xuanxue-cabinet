// PUT /me/student-mode — сотрудник школы включает или выключает себе режим
// ученика (ADR-0163). Без @Roles: у человека в режиме «Действующие роли» пустые
// (AuthGuard, student-mode.ts), и выключатель с `@Roles('teacher')` закрылся бы
// за ним сам. Включить режим может только тот, у кого в БД настоящая роль штата
// (UserStudentModeService) — проверка там, а не в декораторе. Маршрут всё равно
// требует сессии (AuthGuard), не публичный.
import { Body, Controller, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MeDto } from '@xuanxue/shared';
import { ApiRoute } from '../common/api-route.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import { toMeDto } from '../auth/user.mapper';
import type { UserLean } from './users.service';
import { SetStudentModeDto } from './dto/set-student-mode.dto';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserStudentModeService } from './user-student-mode.service';

@Controller('me/student-mode')
export class MyStudentModeController {
  constructor(
    private readonly userStudentModeService: UserStudentModeService,
    private readonly userBotChatStatusService: UserBotChatStatusService,
  ) {}

  // Возвращает MeDto — тот же, что GET /auth/me, тем же toMeDto() — не 204:
  // кабинет перестраивается по ответу (экраны, меню, плашка), без второго GET
  // (ADR-0087). `id` — ТОЛЬКО из сессии (@CurrentUser()), никогда из тела или
  // пути (SECURITY §2). PUT, а не POST: режим — идемпотентная установка значения.
  @ApiRoute('PUT /me/student-mode')
  @Put()
  @HttpCode(HttpStatus.OK)
  async update(
    @Body() body: SetStudentModeDto,
    @CurrentUser() user: UserLean,
  ): Promise<MeDto> {
    const updated = await this.userStudentModeService.setStudentMode(
      user.id,
      body.enabled,
      DateTime.utc(),
    );
    return toMeDto(
      updated,
      await this.userBotChatStatusService.hasActiveChatFor(updated),
    );
  }
}
