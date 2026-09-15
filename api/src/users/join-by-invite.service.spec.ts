// Юнит без Mongo и DI (CLAUDE.md «Тесты»: ветвление по статусу — чистая
// логика поверх фейковых сервисов). Read-after-write перехода invited →
// active покрыт e2e (auth-join.e2e-spec.ts) — здесь только ветвления.
import { DateTime } from 'luxon';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import type { InviteLinkService } from './invite-link.service';
import type { UserRolesService } from './user-roles.service';
import type { UserLean, UsersService } from './users.service';
import { JoinByInviteService } from './join-by-invite.service';

const NOW = DateTime.fromISO('2026-09-15T10:00:00Z');
const CODE = 'a'.repeat(32);

function userWithStatus(status: UserLean['status']): UserLean {
  return { id: 'u1', name: 'Ученик', roles: [], tz: 'Asia/Jerusalem', status };
}

function buildService(options: {
  isValid?: boolean;
  approve?: (id: string) => Promise<UserLean>;
  markJoinedViaInvite?: (id: string, now: DateTime) => Promise<void>;
}): JoinByInviteService {
  const inviteLinkService = {
    isValid: () => Promise.resolve(options.isValid ?? true),
  } as unknown as InviteLinkService;
  const userRolesService = {
    approve:
      options.approve ??
      (() => Promise.reject(new Error('approve не должен был вызываться'))),
  } as unknown as UserRolesService;
  const usersService = {
    markJoinedViaInvite:
      options.markJoinedViaInvite ??
      (() => Promise.reject(new Error('markJoinedViaInvite не должен был вызываться'))),
  } as unknown as UsersService;
  return new JoinByInviteService(inviteLinkService, userRolesService, usersService);
}

describe('JoinByInviteService.join', () => {
  it('неверный код — UnauthorizedError, approve не вызывается', async () => {
    const service = buildService({ isValid: false });

    await expect(
      service.join(userWithStatus('invited'), CODE, NOW),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('blocked — ForbiddenError даже с верным кодом', async () => {
    const service = buildService({ isValid: true });

    await expect(
      service.join(userWithStatus('blocked'), CODE, NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('invited + верный код — approve() и markJoinedViaInvite(), ответ active', async () => {
    const approve = jest.fn().mockResolvedValue({
      ...userWithStatus('active'),
      id: 'u1',
    });
    const markJoinedViaInvite = jest.fn().mockResolvedValue(undefined);
    const service = buildService({ isValid: true, approve, markJoinedViaInvite });

    const result = await service.join(userWithStatus('invited'), CODE, NOW);

    expect(approve).toHaveBeenCalledWith('u1');
    expect(markJoinedViaInvite).toHaveBeenCalledWith('u1', NOW);
    expect(result.status).toBe('active');
  });

  it('active — approve() не вызывается, ответ тот же', async () => {
    const service = buildService({ isValid: true });

    const result = await service.join(userWithStatus('active'), CODE, NOW);

    expect(result.status).toBe('active');
  });
});
