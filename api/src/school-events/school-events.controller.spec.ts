// Test.createTestingModule с фейком сервиса: без HTTP, без Mongo. Роли, CSRF,
// 404 и валидацию проверяет e2e (school-events.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import type { DateTime } from 'luxon';
import type { SchoolEventDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { MySchoolEventsController } from './my-school-events.controller';
import { SchoolEventsController } from './school-events.controller';
import { SchoolEventsService } from './school-events.service';

const EVENT_DTO: SchoolEventDto = {
  id: 'e1',
  title: 'Ретрит',
  startsAt: '2026-11-20T07:00:00.000Z',
  createdBy: 't1',
  createdAt: '2026-10-07T00:00:00.000Z',
};

const TEACHER: UserLean = {
  id: 't1',
  name: 'Учитель',
  roles: ['teacher'],
  status: 'active',
  studentMode: false,
};

async function build(service: Partial<SchoolEventsService>): Promise<{
  staff: SchoolEventsController;
  mine: MySchoolEventsController;
}> {
  const module = await Test.createTestingModule({
    controllers: [SchoolEventsController, MySchoolEventsController],
    providers: [{ provide: SchoolEventsService, useValue: service }],
  }).compile();
  return {
    staff: module.get(SchoolEventsController),
    mine: module.get(MySchoolEventsController),
  };
}

describe('SchoolEventsController', () => {
  it('list() передаёт query в сервис', async () => {
    const list = jest.fn().mockResolvedValue([EVENT_DTO]);
    const { staff } = await build({ list });

    await expect(staff.list({ limit: 5 })).resolves.toEqual([EVENT_DTO]);

    expect(list).toHaveBeenCalledWith({ limit: 5 });
  });

  it('create() берёт автора из сессии, не из тела', async () => {
    const create = jest.fn().mockResolvedValue(EVENT_DTO);
    const { staff } = await build({ create });
    const body = { title: 'Ретрит', startsAt: '2026-11-20T07:00:00Z' };

    await staff.create(body, TEACHER);

    expect(create).toHaveBeenCalledWith(body, 't1');
  });

  it('update() и remove() передают id и тело', async () => {
    const update = jest.fn().mockResolvedValue(EVENT_DTO);
    const remove = jest.fn().mockResolvedValue(undefined);
    const { staff } = await build({ update, remove });

    await staff.update('e1', { place: null });
    await staff.remove('e1');

    expect(update).toHaveBeenCalledWith('e1', { place: null });
    expect(remove).toHaveBeenCalledWith('e1');
  });

  it('GET /me/events: сервису уходит «сейчас» в UTC', async () => {
    const listUpcoming = jest
      .fn<Promise<SchoolEventDto[]>, [DateTime]>()
      .mockResolvedValue([EVENT_DTO]);
    const { mine } = await build({ listUpcoming });

    await expect(mine.list()).resolves.toEqual([EVENT_DTO]);

    expect(listUpcoming.mock.calls[0]?.[0]?.zoneName).toBe('UTC');
  });
});
