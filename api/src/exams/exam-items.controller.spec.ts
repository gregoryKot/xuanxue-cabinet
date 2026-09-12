// Test.createTestingModule с фейком сервиса — образец classes.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404 проверяет e2e (exam-items.e2e-spec.ts) на
// настоящем гварде — здесь только «контроллер зовёт сервис и возвращает его ответ».
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { ExamItemDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ExamItemsController } from './exam-items.controller';
import { ExamItemsService } from './exam-items.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

const ITEM_DTO: ExamItemDto = {
  id: 'i1',
  kind: 'text',
  prompt: 'Формулировка',
  options: [],
  tags: [],
  status: 'draft',
  version: 1,
  history: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

async function buildController(
  service: Partial<ExamItemsService> = {},
): Promise<ExamItemsController> {
  const module = await Test.createTestingModule({
    controllers: [ExamItemsController],
    providers: [{ provide: ExamItemsService, useValue: service }],
  }).compile();
  return module.get(ExamItemsController);
}

describe('ExamItemsController', () => {
  it('list() передаёт query в сервис и возвращает его результат', async () => {
    const list = jest.fn().mockResolvedValue([ITEM_DTO]);
    const controller = await buildController({ list });

    await expect(controller.list({ status: 'draft', limit: 10 })).resolves.toEqual([
      ITEM_DTO,
    ]);
    expect(list).toHaveBeenCalledWith({ status: 'draft', limit: 10 });
  });

  it('getById() передаёт id в сервис', async () => {
    const getById = jest.fn().mockResolvedValue(ITEM_DTO);
    const controller = await buildController({ getById });

    await expect(controller.getById('i1')).resolves.toEqual(ITEM_DTO);
    expect(getById).toHaveBeenCalledWith('i1');
  });

  it('create() передаёт тело и id автора из сессии в сервис', async () => {
    const create = jest.fn().mockResolvedValue(ITEM_DTO);
    const controller = await buildController({ create });
    const body = { kind: 'text' as const, prompt: 'Формулировка' };

    await expect(controller.create(body, USER)).resolves.toEqual(ITEM_DTO);
    expect(create).toHaveBeenCalledWith(body, USER.id);
  });

  it('update() передаёт id, тело и «сейчас» в сервис', async () => {
    const update = jest.fn().mockResolvedValue(ITEM_DTO);
    const controller = await buildController({ update });
    const body = { status: 'published' as const };

    await expect(controller.update('i1', body)).resolves.toEqual(ITEM_DTO);
    expect(update).toHaveBeenCalledWith('i1', body, expect.any(DateTime));
  });

  it('remove() передаёт id в сервис', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ remove });

    await controller.remove('i1');
    expect(remove).toHaveBeenCalledWith('i1');
  });
});
