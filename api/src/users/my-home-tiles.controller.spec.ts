// Test.createTestingModule с фейками сервисов — тот же приём, что
// my-student-mode.controller.spec.ts: без HTTP, без Mongo. Сквозной путь через
// гвард и валидацию тела — api/test/me-home-tiles.e2e-spec.ts; здесь только
// «контроллер зовёт сервис с id из сессии и списком из тела, отвечает MeDto».
import { Test } from '@nestjs/testing';
import type { UserLean } from './users.service';
import { MyHomeTilesController } from './my-home-tiles.controller';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserHomeTilesService } from './user-home-tiles.service';

const SESSION_USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
  studentMode: false,
};

async function buildController(setHidden: jest.Mock): Promise<MyHomeTilesController> {
  const module = await Test.createTestingModule({
    controllers: [MyHomeTilesController],
    providers: [
      { provide: UserHomeTilesService, useValue: { setHidden } },
      {
        provide: UserBotChatStatusService,
        useValue: { hasActiveChatFor: () => Promise.resolve(true) },
      },
    ],
  }).compile();
  return module.get(MyHomeTilesController);
}

describe('MyHomeTilesController.update', () => {
  it('зовёт сервис с id из сессии и списком из тела', async () => {
    const setHidden = jest.fn().mockResolvedValue(SESSION_USER);
    const controller = await buildController(setHidden);

    await controller.update({ hidden: ['payment'] }, SESSION_USER);

    expect(setHidden).toHaveBeenCalledWith('u1', ['payment']);
  });

  it('отвечает MeDto человека из БД со скрытыми плитками', async () => {
    const saved: UserLean = { ...SESSION_USER, homeHiddenTiles: ['payment', 'events'] };
    const controller = await buildController(jest.fn().mockResolvedValue(saved));

    const me = await controller.update({ hidden: ['payment', 'events'] }, SESSION_USER);

    expect(me).toMatchObject({
      id: 'u1',
      botChatActive: true,
      homeHiddenTiles: ['payment', 'events'],
    });
  });
});
