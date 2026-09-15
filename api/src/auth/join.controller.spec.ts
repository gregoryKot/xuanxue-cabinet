// Test.createTestingModule с фейками провайдеров — образец
// auth.controller.spec.ts (эти тесты жили там же, пока JoinController не
// вынесен отдельным файлом, ревью владельца 2026-09-15).
import { Test } from '@nestjs/testing';
import type { UserLean } from '../users/users.service';
import { InviteLinkService } from '../users/invite-link.service';
import { JoinByInviteService } from '../users/join-by-invite.service';
import { JoinController } from './join.controller';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  email: 'maria@example.com',
  roles: ['admin'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

describe('JoinController.checkInvite', () => {
  it('проксирует InviteLinkService.isValid()', async () => {
    const module = await Test.createTestingModule({
      controllers: [JoinController],
      providers: [
        {
          provide: InviteLinkService,
          useValue: {
            isValid: (code: string) => Promise.resolve(code === 'a'.repeat(32)),
          },
        },
        { provide: JoinByInviteService, useValue: {} },
      ],
    }).compile();
    const controller = module.get(JoinController);

    await expect(controller.checkInvite({ code: 'a'.repeat(32) })).resolves.toEqual({
      valid: true,
    });
    await expect(controller.checkInvite({ code: 'b'.repeat(32) })).resolves.toEqual({
      valid: false,
    });
  });
});

describe('JoinController.join', () => {
  it('передаёт код и пользователя сессии в JoinByInviteService.join()', async () => {
    let received: { userId: string; code: string } | undefined;
    const module = await Test.createTestingModule({
      controllers: [JoinController],
      providers: [
        { provide: InviteLinkService, useValue: {} },
        {
          provide: JoinByInviteService,
          useValue: {
            join: (user: UserLean, code: string) => {
              received = { userId: user.id, code };
              return Promise.resolve({ ...USER, status: 'active' });
            },
          },
        },
      ],
    }).compile();
    const controller = module.get(JoinController);

    const result = await controller.join({ code: 'a'.repeat(32) }, USER);

    expect(received).toEqual({ userId: 'u1', code: 'a'.repeat(32) });
    expect(result.status).toBe('active');
  });
});
