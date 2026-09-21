// Test.createTestingModule с фейками сервисов — образец my-lessons.controller.spec.ts/
// notification-prefs.controller.spec.ts: без HTTP, без Mongo. Владение и
// доступ у гостя/ученика проверяет e2e (me-profile.e2e-spec.ts) на настоящем
// гварде — здесь только «контроллер зовёт сервис с id из сессии и телом,
// собирает MeDto тем же toMeDto(), что GET /auth/me (ADR-0087)».
import { Test } from '@nestjs/testing';
import type { MeDto } from '@xuanxue/shared';
import type { UserLean } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { MyProfileController } from './my-profile.controller';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserProfileService } from './user-profile.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Новый ученик',
  roles: [],
  status: 'active',
};

async function buildController(
  service: Partial<UserProfileService> = {},
  botChatStatus: Partial<UserBotChatStatusService> = {
    hasActiveChatFor: () => Promise.resolve(false),
  },
): Promise<MyProfileController> {
  const module = await Test.createTestingModule({
    controllers: [MyProfileController],
    providers: [
      { provide: UserProfileService, useValue: service },
      { provide: UserBotChatStatusService, useValue: botChatStatus },
    ],
  }).compile();
  return module.get(MyProfileController);
}

describe('MyProfileController.update', () => {
  it('зовёт setName с id пользователя из сессии (не из тела) и телом запроса', async () => {
    let received: { userId: string; input: unknown } | undefined;
    const setName = jest.fn().mockImplementation((userId: string, input: unknown) => {
      received = { userId, input };
      return Promise.resolve({ ...USER, name: 'Анна Петрова' });
    });
    const controller = await buildController({ setName });
    const body: UpdateMyProfileDto = { firstName: 'Анна', lastName: 'Петрова' };

    await controller.update(body, USER);

    expect(received).toEqual({ userId: USER.id, input: body });
    expect(setName).toHaveBeenCalledWith(USER.id, body, expect.anything());
  });

  it('отдаёт MeDto, собранный из свежего пользователя после записи, а не 204', async () => {
    const updated: UserLean = {
      ...USER,
      name: 'Анна Петрова',
      profileNamedAt: new Date(),
    };
    const setName = jest.fn().mockResolvedValue(updated);
    const controller = await buildController(
      { setName },
      {
        hasActiveChatFor: (user) => Promise.resolve(user === updated),
      },
    );
    const body: UpdateMyProfileDto = { firstName: 'Анна', lastName: 'Петрова' };

    const result = await controller.update(body, USER);

    expect(result).toEqual<MeDto>({
      id: updated.id,
      name: 'Анна Петрова',
      roles: updated.roles,
      status: updated.status,
      telegramLinked: false,
      botChatActive: true,
      hasEmail: false,
      pendingEmail: undefined,
      noTelegram: false,
      needsProfile: false,
    });
  });
});
