// Test.createTestingModule с фейком сервиса — образец exam-items.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404 проверяет e2e (exams.e2e-spec.ts) на
// настоящем гварде — здесь только «контроллер зовёт сервис и возвращает его ответ».
import { Test } from '@nestjs/testing';
import type { ExamDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: ['teacher'],
  status: 'active',
};

const EXAM_DTO: ExamDto = {
  id: 'e1',
  title: 'Экзамен',
  description: '',
  level: '',
  blocks: [],
  shuffleOptions: false,
  attemptsAllowed: 1,
  status: 'draft',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

async function buildController(
  service: Partial<ExamsService> = {},
): Promise<ExamsController> {
  const module = await Test.createTestingModule({
    controllers: [ExamsController],
    providers: [{ provide: ExamsService, useValue: service }],
  }).compile();
  return module.get(ExamsController);
}

describe('ExamsController', () => {
  it('list() передаёт query в сервис и возвращает его результат', async () => {
    const list = jest.fn().mockResolvedValue([EXAM_DTO]);
    const controller = await buildController({ list });

    await expect(controller.list({ status: 'draft', limit: 10 })).resolves.toEqual([
      EXAM_DTO,
    ]);
    expect(list).toHaveBeenCalledWith({ status: 'draft', limit: 10 });
  });

  it('getById() передаёт id в сервис', async () => {
    const getById = jest.fn().mockResolvedValue(EXAM_DTO);
    const controller = await buildController({ getById });

    await expect(controller.getById('e1')).resolves.toEqual(EXAM_DTO);
    expect(getById).toHaveBeenCalledWith('e1');
  });

  it('create() передаёт тело и id автора из сессии в сервис', async () => {
    const create = jest.fn().mockResolvedValue(EXAM_DTO);
    const controller = await buildController({ create });
    const body = { title: 'Экзамен' };

    await expect(controller.create(body, USER)).resolves.toEqual(EXAM_DTO);
    expect(create).toHaveBeenCalledWith(body, USER.id);
  });

  it('update() передаёт id и тело в сервис', async () => {
    const update = jest.fn().mockResolvedValue(EXAM_DTO);
    const controller = await buildController({ update });
    const body = { status: 'published' as const };

    await expect(controller.update('e1', body)).resolves.toEqual(EXAM_DTO);
    expect(update).toHaveBeenCalledWith('e1', body);
  });

  it('remove() передаёт id в сервис', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ remove });

    await controller.remove('e1');
    expect(remove).toHaveBeenCalledWith('e1');
  });
});
