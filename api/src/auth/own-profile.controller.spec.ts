// Test.createTestingModule с фейками сервисов — образец
// notification-prefs.controller.spec.ts: без HTTP, без Mongo. Владение
// (гость/ученик тоже может, чужой id в теле не проходит) проверяет e2e
// (profile-ownership.e2e-spec.ts) на настоящем гварде и пайпе — здесь
// только «контроллер зовёт сервис с userId из сессии и собирает MeDto».
import { Test } from '@nestjs/testing';
import type { UserLean } from '../users/users.service';
import { OwnNameService } from '../users/own-name.service';
import { PersonalChats } from '../telegram/personal-chats';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OwnProfileController } from './own-profile.controller';

const USER: UserLean = {
  id: 'u1',
  name: 'doctor.martynova@gmail.com',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

const RENAMED: UserLean = { ...USER, name: 'Марина Мартынова' };

async function buildController(
  ownNameService: Partial<OwnNameService> = {},
  personalChats: Partial<PersonalChats> = {},
): Promise<OwnProfileController> {
  const module = await Test.createTestingModule({
    controllers: [OwnProfileController],
    providers: [
      { provide: OwnNameService, useValue: ownNameService },
      { provide: PersonalChats, useValue: personalChats },
    ],
  }).compile();
  return module.get(OwnProfileController);
}

describe('OwnProfileController', () => {
  it('update() передаёт id из сессии и новое имя в сервис, отдаёт MeDto', async () => {
    const renameSelf = jest.fn().mockResolvedValue(RENAMED);
    const hasActiveChatFor = jest.fn().mockResolvedValue(true);
    const controller = await buildController({ renameSelf }, { hasActiveChatFor });
    const body: UpdateProfileDto = { name: 'Марина Мартынова' };

    const result = await controller.update(body, USER);

    expect(renameSelf).toHaveBeenCalledWith(USER.id, body.name);
    expect(hasActiveChatFor).toHaveBeenCalledWith(RENAMED);
    expect(result).toEqual({
      id: RENAMED.id,
      name: RENAMED.name,
      roles: RENAMED.roles,
      tz: RENAMED.tz,
      status: RENAMED.status,
      telegramLinked: false,
      botChatActive: true,
    });
  });
});
