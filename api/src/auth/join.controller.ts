// Вход по ссылке-приглашению школы (ADR-0030) — вынесено из AuthController в
// отдельный файл: оба контроллера вместе описывали бы один класс толще
// 150 строк (file-size-ratchet, ревью владельца 2026-09-15). Тот же префикс
// 'auth' — Nest объединяет маршруты нескольких контроллеров с одинаковым
// @Controller() без коллизии (check-route-collisions.mjs сверяет только
// уникальность самого пути, не файл).
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import type { CheckInviteResultDto, MeDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { InviteLinkService } from '../users/invite-link.service';
import { JoinByInviteService } from '../users/join-by-invite.service';
import { AllowPending, CurrentUser, Public } from './auth.decorators';
import { JoinByInviteDto } from './join-by-invite.dto';
import { toMeDto } from './user.mapper';

// POST /auth/join/check — до входа (@Public()), тот же профиль перебора
// кода, что и у остальных публичных маршрутов входа. POST /auth/join сам —
// без отдельного Throttle: у нас нет верифицированной идентичности для
// троттлинга сессии (нет getTracker() поверх сессии/initData нигде в
// проекте, CLAUDE.md №4), а бакетировать вошедшего по IP отдельным лимитом
// не даёт ничего сверх общего ThrottlerGuard (120/мин/IP, AppModule) — код
// приглашения 128 бит, перебор не грозит ни при каком разумном лимите.
const INVITE_CHECK_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class JoinController {
  constructor(
    private readonly inviteLinkService: InviteLinkService,
    private readonly joinByInviteService: JoinByInviteService,
  ) {}

  // @AllowPending: ссылка-приглашение (ADR-0030) — третий путь из invited в
  // active, наравне с ручным подтверждением и членством в группе. Вошедший
  // active открывает её же — ответ тот же, без изменений.
  @AllowPending()
  @Post('join')
  @HttpCode(HttpStatus.OK)
  async join(
    @Body() body: JoinByInviteDto,
    @CurrentUser() user: UserLean,
  ): Promise<MeDto> {
    const joined = await this.joinByInviteService.join(user, body.code, DateTime.utc());
    return toMeDto(joined);
  }

  // До входа: страница /join/<code> должна сказать «ссылка не действует»,
  // не гнать человека логиниться зря (ADR-0030).
  @Public()
  @Throttle(INVITE_CHECK_THROTTLE)
  @Post('join/check')
  @HttpCode(HttpStatus.OK)
  async checkInvite(@Body() body: JoinByInviteDto): Promise<CheckInviteResultDto> {
    return { valid: await this.inviteLinkService.isValid(body.code) };
  }
}
