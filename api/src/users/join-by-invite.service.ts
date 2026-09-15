// Третий путь invited → active — ссылка-приглашение школы (ADR-0030,
// решение владельца 2026-09-15). Подтверждение — то же
// UserRolesService.approve(), что у кнопки «Подтвердить» на «Людях» и у
// автоподтверждения по группе (student-membership-approval.service.ts):
// переход invited → active не переизобретается третий раз (CLAUDE.md «Дубли»).
// Живёт в users/, не в auth/: оба вызывающих — JoinController (HTTP,
// api/src/auth/) и /start join_<code> в боте (api/src/telegram/) —
// импортируют его через UsersModule, а AuthModule уже импортирует
// TelegramModule — второй импорт в обратную сторону закольцевал бы граф
// модулей (ADR-0013). Возвращает UserLean, не MeDto — маппинг в конкретный
// DTO (веб) или текст ответа (бот) остаётся у вызывающего.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import { InviteLinkService } from './invite-link.service';
import { UserRolesService } from './user-roles.service';
import { UsersService, type UserLean } from './users.service';

@Injectable()
export class JoinByInviteService {
  constructor(
    private readonly inviteLinkService: InviteLinkService,
    private readonly userRolesService: UserRolesService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * `user` — уже известный (сессия веба, включая `invited`, или найденный/
   * созданный по telegramId в боте). Порядок проверок: код неверен — код
   * ссылки не сошёлся (ссылку заменили или её никогда не было, SECURITY §2
   * — один текст на обе причины, вызывающий сам решает, как это подать);
   * `blocked` — капабилити-ссылка не снимает осознанную блокировку, тот же
   * принцип, что и у членства в группе (student-membership-approval.service.ts);
   * `active` — без изменений, тот же ответ, что и после подтверждения
   * (идемпотентно: повторное открытие ссылки уже вошедшим не ошибка).
   */
  async join(user: UserLean, code: string, now: DateTime): Promise<UserLean> {
    const isValid = await this.inviteLinkService.isValid(code);
    if (!isValid) throw new UnauthorizedError(INVITE_LINK_INVALID_MESSAGE);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);
    if (user.status !== 'invited') return user;

    const approved = await this.userRolesService.approve(user.id);
    await this.usersService.markJoinedViaInvite(approved.id, now);
    return { ...approved, joinedViaInviteAt: now.toJSDate() };
  }
}
