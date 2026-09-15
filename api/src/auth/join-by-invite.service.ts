// Третий путь invited → active — ссылка-приглашение школы (ADR-0030,
// решение владельца 2026-09-15). Подтверждение — то же
// UserRolesService.approve(), что у кнопки «Подтвердить» на «Людях» и у
// автоподтверждения по группе (student-membership-approval.service.ts):
// переход invited → active не переизобретается третий раз (CLAUDE.md «Дубли»).
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE, type MeDto } from '@xuanxue/shared';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import { InviteLinkService } from '../users/invite-link.service';
import { UserRolesService } from '../users/user-roles.service';
import { UsersService, type UserLean } from '../users/users.service';
import { toMeDto } from './user.mapper';

@Injectable()
export class JoinByInviteService {
  constructor(
    private readonly inviteLinkService: InviteLinkService,
    private readonly userRolesService: UserRolesService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * `user` — уже вошедший (Telegram или email), включая `invited`
   * (`@AllowPending()` на маршруте). Порядок проверок: код неверен — 401
   * (ссылку заменили или её никогда не было, SECURITY §2 — один текст на
   * обе причины); `blocked` — 403 (капабилити-ссылка не снимает осознанную
   * блокировку, тот же принцип, что и у членства в группе,
   * student-membership-approval.service.ts); `active` — без изменений, тот
   * же ответ, что и после подтверждения (идемпотентно: повторное открытие
   * ссылки уже вошедшим не ошибка).
   */
  async join(user: UserLean, code: string, now: DateTime): Promise<MeDto> {
    const isValid = await this.inviteLinkService.isValid(code);
    if (!isValid) throw new UnauthorizedError(INVITE_LINK_INVALID_MESSAGE);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);
    if (user.status !== 'invited') return toMeDto(user);

    const approved = await this.userRolesService.approve(user.id);
    await this.usersService.markJoinedViaInvite(approved.id, now);
    return toMeDto(approved);
  }
}
