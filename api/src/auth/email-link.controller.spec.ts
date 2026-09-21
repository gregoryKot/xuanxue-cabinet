// Test.createTestingModule с фейком провайдера — образец
// telegram-link.controller.spec.ts (тот же приём у join.controller.spec.ts).
// Главное, что проверяем: владельца адреса контроллер берёт из сессии
// (@CurrentUser()), а не из тела запроса, — SECURITY §2, ADR-0059; и что
// ответ — MeDto, собранный тем же toMeDto(), что GET /auth/me (ADR-0087),
// а не 204. Импорт контроллера тянет за собой оба DTO, поэтому их декораторы
// тоже выполняются (покрытие link-email.dto.ts / confirm-email.dto.ts).
import { Test } from '@nestjs/testing';
import type { MeDto } from '@xuanxue/shared';
import { PersonalChats } from '../telegram/personal-chats';
import type { UserLean } from '../users/users.service';
import { EmailLinkController } from './email-link.controller';
import { EmailLinkService } from './email-link.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: [],
  status: 'active',
};

interface LinkCall {
  userId: string;
  email: string;
}

async function buildController(
  options: { linkResult?: UserLean; hasActiveChatFor?: (user: UserLean) => boolean } = {},
): Promise<{
  controller: EmailLinkController;
  linkCalls: LinkCall[];
  confirmCalls: string[];
}> {
  const linkCalls: LinkCall[] = [];
  const confirmCalls: string[] = [];
  const module = await Test.createTestingModule({
    controllers: [EmailLinkController],
    providers: [
      {
        provide: EmailLinkService,
        useValue: {
          link: (user: UserLean, email: string) => {
            linkCalls.push({ userId: user.id, email });
            return Promise.resolve(
              options.linkResult ?? { ...user, pendingEmail: email },
            );
          },
          confirm: (token: string) => {
            confirmCalls.push(token);
            return Promise.resolve();
          },
        },
      },
      {
        provide: PersonalChats,
        useValue: {
          hasActiveChatFor: (user: UserLean) =>
            Promise.resolve(options.hasActiveChatFor?.(user) ?? false),
        },
      },
    ],
  }).compile();
  return { controller: module.get(EmailLinkController), linkCalls, confirmCalls };
}

describe('EmailLinkController.link', () => {
  it('владелец адреса — пользователь сессии, не поле тела запроса', async () => {
    const { controller, linkCalls } = await buildController();

    await controller.link({ email: 'maria@example.com' }, USER);

    expect(linkCalls).toEqual([{ userId: 'u1', email: 'maria@example.com' }]);
  });

  it('отдаёт MeDto, собранный из ответа EmailLinkService.link() — с новым pendingEmail, не 204', async () => {
    const { controller } = await buildController({ hasActiveChatFor: () => true });

    const result = await controller.link({ email: 'maria@example.com' }, USER);

    expect(result).toEqual<MeDto>({
      id: USER.id,
      name: USER.name,
      roles: USER.roles,
      status: USER.status,
      telegramLinked: false,
      botChatActive: true,
      hasEmail: false,
      pendingEmail: 'maria@example.com',
      noTelegram: false,
      needsProfile: true,
    });
  });
});

describe('EmailLinkController.confirm', () => {
  it('передаёт токен из тела в EmailLinkService.confirm()', async () => {
    const { controller, confirmCalls } = await buildController();
    const token = 'a'.repeat(64);

    await controller.confirm({ token });

    expect(confirmCalls).toEqual([token]);
  });
});
