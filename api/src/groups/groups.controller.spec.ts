// Контроллер групп без HTTP и Mongo: зовёт сервис и возвращает его ответ.
// Роли, CSRF и 404 проверяет e2e (groups.e2e-spec.ts) на настоящем гварде.
import { Test } from '@nestjs/testing';
import type { GroupDto } from '@xuanxue/shared';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

const GROUP: GroupDto = {
  id: 'g1',
  name: 'Средние',
  classCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

async function buildController(
  service: Partial<GroupsService>,
): Promise<GroupsController> {
  const module = await Test.createTestingModule({
    controllers: [GroupsController],
    providers: [{ provide: GroupsService, useValue: service }],
  }).compile();
  return module.get(GroupsController);
}

describe('GroupsController', () => {
  it('list() возвращает ответ сервиса', async () => {
    const list = jest.fn().mockResolvedValue([GROUP]);
    const controller = await buildController({ list });

    await expect(controller.list()).resolves.toEqual([GROUP]);
  });

  it('create() передаёт тело в сервис', async () => {
    const create = jest.fn().mockResolvedValue(GROUP);
    const controller = await buildController({ create });

    await expect(controller.create({ name: 'Средние' })).resolves.toEqual(GROUP);
    expect(create).toHaveBeenCalledWith({ name: 'Средние' });
  });

  it('rename() передаёт id и тело в сервис', async () => {
    const rename = jest.fn().mockResolvedValue(GROUP);
    const controller = await buildController({ rename });

    await expect(controller.rename('g1', { name: 'Средние' })).resolves.toEqual(GROUP);
    expect(rename).toHaveBeenCalledWith('g1', { name: 'Средние' });
  });

  it('remove() передаёт id в сервис', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ remove });

    await controller.remove('g1');
    expect(remove).toHaveBeenCalledWith('g1');
  });
});
