// Test.createTestingModule с фейком сервиса — образец classes.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404 проверяет e2e (channels.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import type { ChannelDto } from '@xuanxue/shared';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

const CHANNEL_DTO: ChannelDto = {
  id: 'c1',
  type: 'telegram',
  title: 'Основной канал',
  active: true,
  target: '@school',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

async function buildController(
  service: Partial<ChannelsService> = {},
): Promise<ChannelsController> {
  const module = await Test.createTestingModule({
    controllers: [ChannelsController],
    providers: [{ provide: ChannelsService, useValue: service }],
  }).compile();
  return module.get(ChannelsController);
}

describe('ChannelsController', () => {
  it('list() передаёт query в сервис и возвращает его результат', async () => {
    const list = jest.fn().mockResolvedValue([CHANNEL_DTO]);
    const controller = await buildController({ list });

    await expect(controller.list({ active: true, limit: 10 })).resolves.toEqual([
      CHANNEL_DTO,
    ]);
    expect(list).toHaveBeenCalledWith({ active: true, limit: 10 });
  });

  it('getById() передаёт id в сервис', async () => {
    const getById = jest.fn().mockResolvedValue(CHANNEL_DTO);
    const controller = await buildController({ getById });

    await expect(controller.getById('c1')).resolves.toEqual(CHANNEL_DTO);
    expect(getById).toHaveBeenCalledWith('c1');
  });

  it('create() передаёт тело в сервис', async () => {
    const create = jest.fn().mockResolvedValue(CHANNEL_DTO);
    const controller = await buildController({ create });
    const body = { type: 'telegram' as const, title: 'x', config: { chatId: '@school' } };

    await expect(controller.create(body)).resolves.toEqual(CHANNEL_DTO);
    expect(create).toHaveBeenCalledWith(body);
  });

  it('update() передаёт id и тело в сервис', async () => {
    const update = jest.fn().mockResolvedValue(CHANNEL_DTO);
    const controller = await buildController({ update });
    const body = { title: 'Новое название' };

    await expect(controller.update('c1', body)).resolves.toEqual(CHANNEL_DTO);
    expect(update).toHaveBeenCalledWith('c1', body);
  });

  it('remove() передаёт id в сервис', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ remove });

    await controller.remove('c1');
    expect(remove).toHaveBeenCalledWith('c1');
  });

  it('test() передаёт id в сервис и возвращает его результат', async () => {
    const test = jest.fn().mockResolvedValue({ status: 'sent' });
    const controller = await buildController({ test });

    await expect(controller.test('c1')).resolves.toEqual({ status: 'sent' });
    expect(test).toHaveBeenCalledWith('c1');
  });
});
