// Test.createTestingModule с фейками сервисов — тот же приём, что
// my-profile.controller.spec.ts: без HTTP, без Mongo. Владение и доступ у
// гостя/ученика проверяет e2e (me-no-telegram.e2e-spec.ts) на настоящем
// гварде — здесь только «контроллер зовёт сервис с id из сессии и телом,
// собирает MeDto тем же toMeDto(), что GET /auth/me (ADR-0087)».
import { Test } from '@nestjs/testing';
import type { MeDto } from '@xuanxue/shared';
import type { UserLean } from './users.service';
import { SetNoTelegramDto } from './dto/set-no-telegram.dto';
import { MyNoTelegramController } from './my-no-telegram.controller';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserNoTelegramService } from './user-no-telegram.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

async function buildController(
  service: Partial<UserNoTelegramService> = {},
  botChatStatus: Partial<UserBotChatStatusService> = {
    hasActiveChatFor: () => Promise.resolve(false),
  },
): Promise<MyNoTelegramController> {
  const module = await Test.createTestingModule({
    controllers: [MyNoTelegramController],
    providers: [
      { provide: UserNoTelegramService, useValue: service },
      { provide: UserBotChatStatusService, useValue: botChatStatus },
    ],
  }).compile();
  return module.get(MyNoTelegramController);
}

describe('MyNoTelegramController.update', () => {
  it('зовёт setNoTelegram с id пользователя из сессии (не из тела) и значением из тела', async () => {
    let received: { userId: string; noTelegram: boolean } | undefined;
    const setNoTelegram = jest
      .fn()
      .mockImplementation((userId: string, noTelegram: boolean) => {
        received = { userId, noTelegram };
        return Promise.resolve({ ...USER, noTelegramAt: new Date() });
      });
    const controller = await buildController({ setNoTelegram });
    const body: SetNoTelegramDto = { noTelegram: true };

    await controller.update(body, USER);

    expect(received).toEqual({ userId: USER.id, noTelegram: true });
    expect(setNoTelegram).toHaveBeenCalledWith(USER.id, true, expect.anything());
  });

  it('отдаёт MeDto, собранный из свежего пользователя после записи, а не 204', async () => {
    const updated: UserLean = { ...USER, noTelegramAt: new Date() };
    const setNoTelegram = jest.fn().mockResolvedValue(updated);
    const controller = await buildController(
      { setNoTelegram },
      {
        hasActiveChatFor: (user) => Promise.resolve(user === updated),
      },
    );
    const body: SetNoTelegramDto = { noTelegram: true };

    const result = await controller.update(body, USER);

    expect(result).toEqual<MeDto>({
      id: updated.id,
      name: updated.name,
      roles: updated.roles,
      status: updated.status,
      telegramLinked: false,
      botChatActive: true,
      hasEmail: false,
      pendingEmail: undefined,
      noTelegram: true,
      needsProfile: true,
    });
  });
});
