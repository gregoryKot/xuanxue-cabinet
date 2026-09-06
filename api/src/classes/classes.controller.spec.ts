// Test.createTestingModule с фейком сервиса — образец auth.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404 проверяет e2e (classes.e2e-spec.ts) на
// настоящем гварде — здесь только «контроллер зовёт сервис и возвращает его ответ».
import { Test } from '@nestjs/testing';
import type { ClassDto } from '@xuanxue/shared';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

const CLASS_DTO: ClassDto = {
  id: 'c1',
  title: 'Тайцзицюань',
  groupLabel: '',
  format: 'online',
  rules: [],
  tz: 'Asia/Jerusalem',
  channelIds: [],
  leadMinutes: 30,
  active: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

async function buildController(
  service: Partial<ClassesService> = {},
): Promise<ClassesController> {
  const module = await Test.createTestingModule({
    controllers: [ClassesController],
    providers: [{ provide: ClassesService, useValue: service }],
  }).compile();
  return module.get(ClassesController);
}

describe('ClassesController', () => {
  it('list() передаёт query в сервис и возвращает его результат', async () => {
    const list = jest.fn().mockResolvedValue([CLASS_DTO]);
    const controller = await buildController({ list });

    await expect(controller.list({ active: true, limit: 10 })).resolves.toEqual([
      CLASS_DTO,
    ]);
    expect(list).toHaveBeenCalledWith({ active: true, limit: 10 });
  });

  it('getById() передаёт id в сервис', async () => {
    const getById = jest.fn().mockResolvedValue(CLASS_DTO);
    const controller = await buildController({ getById });

    await expect(controller.getById('c1')).resolves.toEqual(CLASS_DTO);
    expect(getById).toHaveBeenCalledWith('c1');
  });

  it('create() передаёт тело в сервис', async () => {
    const create = jest.fn().mockResolvedValue(CLASS_DTO);
    const controller = await buildController({ create });
    const body = { title: 'Тайцзицюань', format: 'online' as const };

    await expect(controller.create(body)).resolves.toEqual(CLASS_DTO);
    expect(create).toHaveBeenCalledWith(body);
  });

  it('update() передаёт id и тело в сервис', async () => {
    const update = jest.fn().mockResolvedValue(CLASS_DTO);
    const controller = await buildController({ update });
    const body = { zoomPassword: null };

    await expect(controller.update('c1', body)).resolves.toEqual(CLASS_DTO);
    expect(update).toHaveBeenCalledWith('c1', body);
  });

  it('remove() передаёт id в сервис', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ remove });

    await controller.remove('c1');
    expect(remove).toHaveBeenCalledWith('c1');
  });
});
