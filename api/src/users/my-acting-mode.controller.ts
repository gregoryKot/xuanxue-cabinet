// PUT /me/student-mode (ADR-0163) и PUT /me/teacher-mode (ADR-0190) — человек
// включает или выключает себе режим. Без @Roles: у человека в режиме «Действующие
// роли» урезаны (AuthGuard, acting-mode.ts), и выключатель с `@Roles('teacher')`
// закрылся бы за ним сам. Включить режим может только тот, у кого в БД настоящая
// роль (UserActingModeService) — проверка там, а не в декораторе. Маршрут всё
// равно требует сессии (AuthGuard), не публичный.
import { Body, Controller, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MeDto } from '@xuanxue/shared';
import { ApiRoute } from '../common/api-route.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import { toMeDto } from '../auth/user.mapper';
import type { ActingModeKey } from './acting-mode';
import type { UserLean } from './users.service';
import { SetStudentModeDto, SetTeacherModeDto } from './dto/set-acting-mode.dto';
import { UserActingModeService } from './user-acting-mode.service';
import { UserBotChatStatusService } from './user-bot-chat-status.service';

@Controller('me')
export class MyActingModeController {
  constructor(
    private readonly userActingModeService: UserActingModeService,
    private readonly userBotChatStatusService: UserBotChatStatusService,
  ) {}

  // Возвращает MeDto — тот же, что GET /auth/me, тем же toMeDto() — не 204:
  // кабинет перестраивается по ответу (экраны, меню, плашка), без второго GET
  // (ADR-0087). `id` — ТОЛЬКО из сессии (@CurrentUser()), никогда из тела или
  // пути (SECURITY §2). PUT, а не POST: режим — идемпотентная установка значения.
  @ApiRoute('PUT /me/student-mode')
  @Put('student-mode')
  @HttpCode(HttpStatus.OK)
  setStudentMode(
    @Body() body: SetStudentModeDto,
    @CurrentUser() user: UserLean,
  ): Promise<MeDto> {
    return this.update('student', body.enabled, user);
  }

  @ApiRoute('PUT /me/teacher-mode')
  @Put('teacher-mode')
  @HttpCode(HttpStatus.OK)
  setTeacherMode(
    @Body() body: SetTeacherModeDto,
    @CurrentUser() user: UserLean,
  ): Promise<MeDto> {
    return this.update('teacher', body.enabled, user);
  }

  private async update(
    mode: ActingModeKey,
    enabled: boolean,
    user: UserLean,
  ): Promise<MeDto> {
    const updated = await this.userActingModeService.setMode(
      mode,
      user.id,
      enabled,
      DateTime.utc(),
    );
    return toMeDto(
      updated,
      await this.userBotChatStatusService.hasActiveChatFor(updated),
    );
  }
}
