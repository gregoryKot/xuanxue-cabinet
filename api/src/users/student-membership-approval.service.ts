// Общий путь подтверждения `invited`-человека участием в группе учеников
// (ADR-0026, CLAUDE.md «Ноль нагрузки на ученика»). Два входа зовут один и
// тот же код, а не переизобретают его: TelegramAuthService — человек мог
// войти ДО того, как его добавили в группу, и перепроверяет статус при
// КАЖДОМ следующем входе; ChatMemberJoinHandler — человека добавили в
// группу, пока он уже ждёт с открытой вкладкой. Раньше проверка членства
// была только при первом входе (statusForNewUser) — человек, добавленный в
// группу позже, навсегда оставался `invited` до ручной кнопки админа.
//
// Подтверждение — то же `UserRolesService.approve()`, что у кнопки на
// «Людях»: идемпотентно (повторный вызов на уже `active` не падает и не
// перезаписывает лишний раз) и безопасно к гонке двух одновременных вызовов
// (условный `findOneAndUpdate` по прежнему статусу внутри approve). Второй
// код для той же гонки здесь не заводим.
import { Injectable } from '@nestjs/common';
import { GroupMembershipService } from '../channels/group-membership.service';
import { UserRolesService } from './user-roles.service';
import type { UserLean } from './users.service';

@Injectable()
export class StudentMembershipApprovalService {
  constructor(
    private readonly groupMembership: GroupMembershipService,
    private readonly userRoles: UserRolesService,
  ) {}

  /**
   * `user` подтверждается, только если он ждёт (`status: 'invited'`) и уже
   * состоит в группе учеников школы в Telegram. Любой другой статус —
   * `active` или `blocked` — возвращается без изменений: участие в группе
   * не снимает осознанную блокировку админа (SECURITY §9, не «симметрия»
   * входа/выхода ради красоты) и не трогает уже подтверждённого. Без
   * `telegramId` (человек вошёл только по email/Google) проверять нечего.
   * Сбой Bot API не долетает сюда исключением — `isMemberOfSchoolGroup`
   * ловит его сам и отдаёт `false` (SECURITY §2): вход не падает, никто не
   * подтверждается по ошибке.
   */
  async confirmIfMember(user: UserLean): Promise<UserLean> {
    if (user.status !== 'invited' || user.telegramId === undefined) return user;
    const isMember = await this.groupMembership.isMemberOfSchoolGroup(user.telegramId);
    if (!isMember) return user;
    return this.userRoles.approve(user.id);
  }
}
