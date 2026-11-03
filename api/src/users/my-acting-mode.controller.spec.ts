// Test.createTestingModule с фейками сервисов — тот же приём, что
// my-no-telegram.controller.spec.ts: без HTTP, без Mongo. Роли в БД, 403 для
// ученика и сквозной путь через гвард проверяют service-спек и e2e
// (student-mode.e2e-spec.ts, teacher-mode.e2e-spec.ts) — здесь только
// «контроллер зовёт сервис с режимом, id из сессии и значением из тела,
// отвечает MeDto с действующими ролями».
import { Test } from '@nestjs/testing';
import type { UserLean } from './users.service';
import { MyActingModeController } from './my-acting-mode.controller';
import { UserActingModeService } from './user-acting-mode.service';
import { UserBotChatStatusService } from './user-bot-chat-status.service';

// Что гвард кладёт в request.user: у человека в режиме роли уже урезаны.
const SESSION_USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: [],
  status: 'active',
  studentMode: true,
  teacherMode: false,
};

async function buildController(setMode: jest.Mock): Promise<MyActingModeController> {
  const module = await Test.createTestingModule({
    controllers: [MyActingModeController],
    providers: [
      { provide: UserActingModeService, useValue: { setMode } },
      {
        provide: UserBotChatStatusService,
        useValue: { hasActiveChatFor: () => Promise.resolve(true) },
      },
    ],
  }).compile();
  return module.get(MyActingModeController);
}

describe('MyActingModeController.setStudentMode', () => {
  it('зовёт сервис с режимом ученика, id из сессии и enabled из тела', async () => {
    const setMode = jest.fn().mockResolvedValue({ ...SESSION_USER, roles: ['teacher'] });
    const controller = await buildController(setMode);

    await controller.setStudentMode({ enabled: false }, SESSION_USER);

    expect(setMode).toHaveBeenCalledWith('student', 'u1', false, expect.anything());
  });

  it('человек из БД с настоящими ролями — в ответе роли действующие: [] и studentMode', async () => {
    const real: UserLean = { ...SESSION_USER, roles: ['admin'], studentMode: true };
    const controller = await buildController(jest.fn().mockResolvedValue(real));

    const me = await controller.setStudentMode({ enabled: true }, SESSION_USER);

    expect(me).toMatchObject({
      id: 'u1',
      roles: [],
      studentMode: true,
      canUseStudentMode: true,
      teacherMode: false,
      botChatActive: true,
    });
  });

  it('режим выключили — роли в ответе снова настоящие', async () => {
    const real: UserLean = { ...SESSION_USER, roles: ['admin'], studentMode: false };
    const controller = await buildController(jest.fn().mockResolvedValue(real));

    const me = await controller.setStudentMode({ enabled: false }, SESSION_USER);

    expect(me).toMatchObject({
      roles: ['admin'],
      studentMode: false,
      canUseStudentMode: true,
    });
  });
});

describe('MyActingModeController.setTeacherMode', () => {
  const ADMIN_SESSION: UserLean = {
    ...SESSION_USER,
    roles: ['admin'],
    studentMode: false,
  };

  it('зовёт сервис с режимом учителя, id из сессии и enabled из тела', async () => {
    const setMode = jest.fn().mockResolvedValue(ADMIN_SESSION);
    const controller = await buildController(setMode);

    await controller.setTeacherMode({ enabled: true }, ADMIN_SESSION);

    expect(setMode).toHaveBeenCalledWith('teacher', 'u1', true, expect.anything());
  });

  it('админ включил — в ответе роли действующие: [teacher], teacherMode и canUseTeacherMode', async () => {
    const real: UserLean = { ...ADMIN_SESSION, teacherMode: true };
    const controller = await buildController(jest.fn().mockResolvedValue(real));

    const me = await controller.setTeacherMode({ enabled: true }, ADMIN_SESSION);

    expect(me).toMatchObject({
      roles: ['teacher'],
      teacherMode: true,
      canUseTeacherMode: true,
      studentMode: false,
      botChatActive: true,
    });
  });

  it('режим выключили — роли в ответе снова настоящие', async () => {
    const controller = await buildController(jest.fn().mockResolvedValue(ADMIN_SESSION));

    const me = await controller.setTeacherMode({ enabled: false }, ADMIN_SESSION);

    expect(me).toMatchObject({
      roles: ['admin'],
      teacherMode: false,
      canUseTeacherMode: true,
    });
  });
});
