// Чистая логика с фейком UsersService, без Mongo (CLAUDE.md «Тесты»):
// UsersService.findByTelegramId уже проверен против настоящей Mongo в
// users.service.spec.ts, здесь — только отображение статуса на решение
// доступа (SECURITY §2/§9).
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import type { UserLean, UsersService } from '../users/users.service';
import { BotUserAccessService } from './bot-user-access.service';

function fakeUsersService(user: UserLean | null): UsersService {
  return {
    findByTelegramId: jest.fn().mockResolvedValue(user),
  } as unknown as UsersService;
}

function user(status: UserLean['status']): UserLean {
  return { id: 'u1', name: 'Ольга', roles: [], status };
}

describe('BotUserAccessService.resolve', () => {
  it('незнакомец (нет записи в users) — unknown', async () => {
    const service = new BotUserAccessService(fakeUsersService(null));

    await expect(service.resolve(111)).resolves.toEqual({ kind: 'unknown' });
  });

  it('active — пропускает с самим пользователем', async () => {
    const active = user('active');
    const service = new BotUserAccessService(fakeUsersService(active));

    await expect(service.resolve(111)).resolves.toEqual({ kind: 'active', user: active });
  });

  it('blocked — denied с тем же текстом, что отдаёт AuthGuard в вебе', async () => {
    const service = new BotUserAccessService(fakeUsersService(user('blocked')));

    await expect(service.resolve(111)).resolves.toEqual({
      kind: 'denied',
      message: ACCESS_MESSAGE,
    });
  });
});
