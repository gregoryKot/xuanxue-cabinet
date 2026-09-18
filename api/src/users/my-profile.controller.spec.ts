// Test.createTestingModule с фейком сервиса — образец my-lessons.controller.spec.ts/
// notification-prefs.controller.spec.ts: без HTTP, без Mongo. Владение и
// доступ у гостя/ученика проверяет e2e (me-profile.e2e-spec.ts) на настоящем
// гварде — здесь только «контроллер зовёт сервис с id из сессии и телом».
import { Test } from '@nestjs/testing';
import type { UserLean } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { MyProfileController } from './my-profile.controller';
import { UserProfileService } from './user-profile.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Новый ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

async function buildController(
  service: Partial<UserProfileService> = {},
): Promise<MyProfileController> {
  const module = await Test.createTestingModule({
    controllers: [MyProfileController],
    providers: [{ provide: UserProfileService, useValue: service }],
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

    await expect(controller.update(body, USER)).resolves.toBeUndefined();

    expect(received).toEqual({ userId: USER.id, input: body });
    expect(setName).toHaveBeenCalledWith(USER.id, body, expect.anything());
  });
});
