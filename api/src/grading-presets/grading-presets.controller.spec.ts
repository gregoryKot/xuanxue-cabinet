// Test.createTestingModule с фейком сервиса — образец
// channels.controller.spec.ts: без HTTP, без Mongo. Роли/CSRF/404/владение
// проверяет e2e (grading-presets.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import type { GradingCommentPresetDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { GradingPresetsController } from './grading-presets.controller';
import { GradingPresetsService } from './grading-presets.service';

const PRESET_DTO: GradingCommentPresetDto = {
  id: 'p1',
  text: 'Держите центр тяжести',
  createdBy: 't1',
  createdAt: '2026-09-01T00:00:00.000Z',
};

const TEACHER: UserLean = {
  id: 't1',
  name: 'Учитель',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

async function buildController(
  service: Partial<GradingPresetsService> = {},
): Promise<GradingPresetsController> {
  const module = await Test.createTestingModule({
    controllers: [GradingPresetsController],
    providers: [{ provide: GradingPresetsService, useValue: service }],
  }).compile();
  return module.get(GradingPresetsController);
}

describe('GradingPresetsController', () => {
  it('list() передаёт query в сервис и возвращает его результат', async () => {
    const list = jest.fn().mockResolvedValue([PRESET_DTO]);
    const controller = await buildController({ list });

    await expect(controller.list({ limit: 10 })).resolves.toEqual([PRESET_DTO]);
    expect(list).toHaveBeenCalledWith({ limit: 10 });
  });

  it('create() передаёт тело и id автора из сессии в сервис', async () => {
    const create = jest.fn().mockResolvedValue(PRESET_DTO);
    const controller = await buildController({ create });
    const body = { text: 'Держите центр тяжести' };

    await expect(controller.create(body, TEACHER)).resolves.toEqual(PRESET_DTO);
    expect(create).toHaveBeenCalledWith(body, TEACHER.id);
  });

  it('update() передаёт id и тело в сервис', async () => {
    const update = jest.fn().mockResolvedValue(PRESET_DTO);
    const controller = await buildController({ update });
    const body = { text: 'Новый текст' };

    await expect(controller.update('p1', body)).resolves.toEqual(PRESET_DTO);
    expect(update).toHaveBeenCalledWith('p1', body);
  });

  it('remove() передаёт id в сервис', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ remove });

    await controller.remove('p1');
    expect(remove).toHaveBeenCalledWith('p1');
  });
});
