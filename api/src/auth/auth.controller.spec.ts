// Test.createTestingModule с фейками провайдеров — образец
// health.controller.spec.ts: без HTTP, без Mongo.
import { Test } from '@nestjs/testing';
import { fakeResponse } from '../test-support/http-fakes';
import type { UserLean } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  email: 'maria@example.com',
  roles: ['admin'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

async function buildController(): Promise<AuthController> {
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: { logoutCookie: () => 'session=; Max-Age=0' } },
    ],
  }).compile();
  return module.get(AuthController);
}

describe('AuthController.me', () => {
  it('возвращает MeDto для пользователя, которого положил гвард', async () => {
    const controller = await buildController();
    expect(controller.me(USER)).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      tz: 'Asia/Jerusalem',
    });
  });
});

describe('AuthController.logout', () => {
  it('ставит Set-Cookie из AuthService.logoutCookie()', async () => {
    const controller = await buildController();
    const res = fakeResponse();
    controller.logout(res);
    expect(res.headers['Set-Cookie']).toBe('session=; Max-Age=0');
  });
});
