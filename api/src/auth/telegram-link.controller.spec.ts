// Test.createTestingModule с фейком провайдера — образец join.controller.spec.ts.
import { Test } from '@nestjs/testing';
import type { UserLean } from '../users/users.service';
import { TelegramLinkCodeService } from '../users/telegram-link-code.service';
import { TelegramLinkController } from './telegram-link.controller';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  email: 'maria@example.com',
  roles: [],
  status: 'active',
};

describe('TelegramLinkController.issueLinkCode', () => {
  it('передаёт id пользователя сессии в TelegramLinkCodeService.issueLink()', async () => {
    let receivedUserId: string | undefined;
    const module = await Test.createTestingModule({
      controllers: [TelegramLinkController],
      providers: [
        {
          provide: TelegramLinkCodeService,
          useValue: {
            issueLink: (userId: string) => {
              receivedUserId = userId;
              return Promise.resolve({
                telegramUrl: 'https://t.me/xuanxue_bot?start=link_x',
              });
            },
          },
        },
      ],
    }).compile();
    const controller = module.get(TelegramLinkController);

    const result = await controller.issueLinkCode(USER);

    expect(receivedUserId).toBe('u1');
    expect(result).toEqual({ telegramUrl: 'https://t.me/xuanxue_bot?start=link_x' });
  });
});
