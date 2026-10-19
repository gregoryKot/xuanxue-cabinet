// Фейк сервиса, без HTTP и Mongo: контроллер зовёт сервис с id из гварда и
// отдаёт снимок как есть. Доступ по cookie и bearer, изоляцию аккаунтов и
// заголовки проверяет api/test/reminder-sync-read.e2e-spec.ts.
import { Test } from '@nestjs/testing';
import { ALLOW_NATIVE_BEARER_KEY } from '../auth/auth.decorators';
import type { ReminderSyncSnapshot } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ReminderSyncController } from './reminder-sync.controller';
import { ReminderSyncService } from './reminder-sync.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
  studentMode: false,
};

const SNAPSHOT: ReminderSyncSnapshot = {
  version: 1,
  accountId: 'u1',
  revision: '0',
  classIds: [],
  lessonIds: [],
  leadMinutes: null,
  schoolMinutes: 60,
  classes: [],
};

describe('ReminderSyncController', () => {
  async function build(getSnapshot: jest.Mock): Promise<ReminderSyncController> {
    const module = await Test.createTestingModule({
      controllers: [ReminderSyncController],
      providers: [{ provide: ReminderSyncService, useValue: { getSnapshot } }],
    }).compile();
    return module.get(ReminderSyncController);
  }

  it('get() берёт аккаунт из гварда и отдаёт снимок сервиса как есть', async () => {
    const getSnapshot = jest.fn().mockResolvedValue(SNAPSHOT);
    const controller = await build(getSnapshot);

    await expect(controller.get(USER)).resolves.toEqual(SNAPSHOT);
    expect(getSnapshot).toHaveBeenCalledWith('u1');
  });

  it('маршрут помечен @AllowNativeBearer(): без метки bearer гвард не читает', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      ReminderSyncController.prototype,
      'get',
    )?.value;
    expect(Reflect.getMetadata(ALLOW_NATIVE_BEARER_KEY, handler as object)).toBe(true);
  });
});
