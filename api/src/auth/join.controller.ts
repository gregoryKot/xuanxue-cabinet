// Проверка ссылки-приглашения школы до входа (ADR-0030, ADR-0036). Страница
// `/join/<code>` должна сказать «ссылка не действует», не гнать человека
// логиниться зря на мёртвую ссылку — сам вход и присоединение к школе
// («ждущего» больше нет) идут через `POST /auth/telegram`/`POST /auth/email/verify`
// с `inviteCode`, отдельного `POST /auth/join` не осталось. Тот же префикс
// 'auth' — Nest объединяет маршруты нескольких контроллеров с одинаковым
// @Controller() без коллизии (check-route-collisions.mjs сверяет только
// уникальность самого пути, не файл).
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CheckInviteResultDto } from '@xuanxue/shared';
import { InviteLinkService } from '../users/invite-link.service';
import { Public } from './auth.decorators';
import { JoinByInviteDto } from './join-by-invite.dto';

// До входа: код ссылки 128 бит, перебор не грозит ни при каком разумном
// лимите — тот же профиль, что у остальных публичных проверок входа.
const INVITE_CHECK_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class JoinController {
  constructor(private readonly inviteLinkService: InviteLinkService) {}

  @Public()
  @Throttle(INVITE_CHECK_THROTTLE)
  @Post('join/check')
  @HttpCode(HttpStatus.OK)
  async checkInvite(@Body() body: JoinByInviteDto): Promise<CheckInviteResultDto> {
    return { valid: await this.inviteLinkService.isValid(body.code) };
  }
}
