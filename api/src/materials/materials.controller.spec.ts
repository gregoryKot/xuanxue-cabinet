// Test.createTestingModule с фейком сервиса — образец
// grading-presets.controller.spec.ts: без HTTP, без Mongo. Роли, CSRF, 404 и
// то, что ученик не видит служебных полей, проверяет e2e
// (api/test/materials.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import type { MaterialDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

const MATERIAL_DTO: MaterialDto = {
  id: 'm1',
  title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
  url: 'https://example.com/book',
  kind: 'book',
  classIds: [],
  lessonIds: [],
  access: 'all',
  tags: [],
  createdBy: 't1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const TEACHER: UserLean = {
  id: 't1',
  name: 'Учитель',
  roles: ['teacher'],
  status: 'active',
};

async function buildController(
  service: Partial<MaterialsService> = {},
): Promise<MaterialsController> {
  const module = await Test.createTestingModule({
    controllers: [MaterialsController],
    providers: [{ provide: MaterialsService, useValue: service }],
  }).compile();
  return module.get(MaterialsController);
}

describe('MaterialsController', () => {
  it('list() передаёт query в сервис и возвращает его результат', async () => {
    const list = jest.fn().mockResolvedValue([MATERIAL_DTO]);
    const controller = await buildController({ list });

    await expect(controller.list({ kind: 'book', limit: 10 })).resolves.toEqual([
      MATERIAL_DTO,
    ]);
    expect(list).toHaveBeenCalledWith({ kind: 'book', limit: 10 });
  });

  // Автор берётся из сессии, не из тела запроса (SECURITY §2: `body.userId` —
  // не поле ввода).
  it('create() передаёт тело и id автора из сессии в сервис', async () => {
    const create = jest.fn().mockResolvedValue(MATERIAL_DTO);
    const controller = await buildController({ create });
    const body = {
      title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
      url: 'https://example.com/book',
      kind: 'book',
    } as const;

    await expect(controller.create(body, TEACHER)).resolves.toEqual(MATERIAL_DTO);
    expect(create).toHaveBeenCalledWith(body, TEACHER.id);
  });

  it('update() передаёт id и тело в сервис', async () => {
    const update = jest.fn().mockResolvedValue(MATERIAL_DTO);
    const controller = await buildController({ update });
    const body = { title: 'Другое название' };

    await expect(controller.update('m1', body)).resolves.toEqual(MATERIAL_DTO);
    expect(update).toHaveBeenCalledWith('m1', body);
  });

  it('remove() передаёт id в сервис', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ remove });

    await controller.remove('m1');
    expect(remove).toHaveBeenCalledWith('m1');
  });
});
