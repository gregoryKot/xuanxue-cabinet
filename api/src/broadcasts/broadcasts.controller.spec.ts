// Test.createTestingModule с фейком сервиса — образец lessons.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404 проверяет e2e (broadcasts.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { BroadcastDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';

const BROADCAST_DTO: BroadcastDto = {
  id: 'b1',
  kind: 'manual',
  status: 'scheduled',
  text: 'Итоги месяца',
  scheduledAt: '2026-09-06T18:00:00.000Z',
  channelIds: ['c1'],
  createdAt: '2026-09-06T18:00:00.000Z',
  updatedAt: '2026-09-06T18:00:00.000Z',
};

const TEACHER: UserLean = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

async function buildController(
  service: Partial<BroadcastsService> = {},
): Promise<BroadcastsController> {
  const module = await Test.createTestingModule({
    controllers: [BroadcastsController],
    providers: [{ provide: BroadcastsService, useValue: service }],
  }).compile();
  return module.get(BroadcastsController);
}

describe('BroadcastsController', () => {
  it('getById() передаёт id в сервис', async () => {
    const getById = jest.fn().mockResolvedValue(BROADCAST_DTO);
    const controller = await buildController({ getById });

    await expect(controller.getById('b1')).resolves.toEqual(BROADCAST_DTO);
    expect(getById).toHaveBeenCalledWith('b1');
  });

  it('create() передаёт тело, id учителя из сессии и now в сервис', async () => {
    const createManual = jest.fn().mockResolvedValue(BROADCAST_DTO);
    const controller = await buildController({ createManual });
    const body = { text: 'Итоги месяца', channelIds: ['c1'] };

    await expect(controller.create(body, TEACHER)).resolves.toEqual(BROADCAST_DTO);
    // `now` — DateTime.utc() контроллера, конкретный момент проверен в
    // broadcasts.service.spec.ts.
    expect(createManual).toHaveBeenCalledWith(body, 'u1', expect.any(DateTime));
  });

  it('list() передаёт query в сервис', async () => {
    const list = jest.fn().mockResolvedValue([BROADCAST_DTO]);
    const controller = await buildController({ list });
    const query = { from: '2026-09-01T00:00:00Z', to: '2026-09-08T00:00:00Z' };

    await expect(controller.list(query)).resolves.toEqual([BROADCAST_DTO]);
    expect(list).toHaveBeenCalledWith(query);
  });

  it('listDeliveries() передаёт id в сервис', async () => {
    const listDeliveries = jest.fn().mockResolvedValue([]);
    const controller = await buildController({ listDeliveries });

    await expect(controller.listDeliveries('b1')).resolves.toEqual([]);
    expect(listDeliveries).toHaveBeenCalledWith('b1');
  });

  it('cancel() передаёт id в сервис', async () => {
    const cancel = jest.fn().mockResolvedValue({ ...BROADCAST_DTO, status: 'cancelled' });
    const controller = await buildController({ cancel });

    await expect(controller.cancel('b1')).resolves.toEqual({
      ...BROADCAST_DTO,
      status: 'cancelled',
    });
    expect(cancel).toHaveBeenCalledWith('b1');
  });
});
