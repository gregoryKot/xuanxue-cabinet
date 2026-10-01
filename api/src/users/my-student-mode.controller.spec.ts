// Test.createTestingModule с фейками сервисов — тот же приём, что
// my-no-telegram.controller.spec.ts: без HTTP, без Mongo. Роли в БД, 403 для
// ученика и сквозной путь через гвард проверяют service-спек и e2e
// (student-mode.e2e-spec.ts) — здесь только «контроллер зовёт сервис с id из
// сессии и значением из тела, отвечает MeDto с действующими ролями».
import { Test } from '@nestjs/testing';
import type { UserLean } from './users.service';
import { SetStudentModeDto } from './dto/set-student-mode.dto';
import { MyStudentModeController } from './my-student-mode.controller';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserStudentModeService } from './user-student-mode.service';

// Что гвард кладёт в request.user: у человека в режиме роли уже пустые.
const SESSION_USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: [],
  status: 'active',
  studentMode: true,
};

async function buildController(
  setStudentMode: jest.Mock,
): Promise<MyStudentModeController> {
  const module = await Test.createTestingModule({
    controllers: [MyStudentModeController],
    providers: [
      { provide: UserStudentModeService, useValue: { setStudentMode } },
      {
        provide: UserBotChatStatusService,
        useValue: { hasActiveChatFor: () => Promise.resolve(true) },
      },
    ],
  }).compile();
  return module.get(MyStudentModeController);
}

describe('MyStudentModeController.update', () => {
  it('зовёт сервис с id из сессии и enabled из тела', async () => {
    const setStudentMode = jest.fn().mockResolvedValue({
      ...SESSION_USER,
      roles: ['teacher'],
    });
    const controller = await buildController(setStudentMode);
    const body: SetStudentModeDto = { enabled: false };

    await controller.update(body, SESSION_USER);

    expect(setStudentMode).toHaveBeenCalledWith('u1', false, expect.anything());
  });

  it('человек из БД с настоящими ролями — в ответе роли действующие: [] и studentMode', async () => {
    const real: UserLean = { ...SESSION_USER, roles: ['admin'], studentMode: true };
    const controller = await buildController(jest.fn().mockResolvedValue(real));

    const me = await controller.update({ enabled: true }, SESSION_USER);

    expect(me).toMatchObject({
      id: 'u1',
      roles: [],
      studentMode: true,
      canUseStudentMode: true,
      botChatActive: true,
    });
  });

  it('режим выключили — роли в ответе снова настоящие', async () => {
    const real: UserLean = { ...SESSION_USER, roles: ['admin'], studentMode: false };
    const controller = await buildController(jest.fn().mockResolvedValue(real));

    const me = await controller.update({ enabled: false }, SESSION_USER);

    expect(me).toMatchObject({
      roles: ['admin'],
      studentMode: false,
      canUseStudentMode: true,
    });
  });
});
