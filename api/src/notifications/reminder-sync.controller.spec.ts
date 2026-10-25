// Фейки сервисов, без HTTP и Mongo: контроллер зовёт сервис с id из гварда и
// отдаёт снимок как есть. Доступ по cookie и bearer, изоляцию аккаунтов и
// заголовки проверяют api/test/reminder-sync-read.e2e-spec.ts и
// reminder-sync-write.e2e-spec.ts.
import { Test } from '@nestjs/testing';
import { ALLOW_NATIVE_BEARER_KEY } from '../auth/auth.decorators';
import type { ReminderSyncSnapshot } from '@xuanxue/shared';
import { UnsupportedMediaTypeError } from '../common/errors';
import type { UserLean } from '../users/users.service';
import { ReminderSyncController } from './reminder-sync.controller';
import { ReminderSyncWriteService } from './reminder-sync-write.service';
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

const CLASS_ID = 'a'.repeat(24);
const BODY = Buffer.from(
  JSON.stringify({
    version: 1,
    changes: [{ kind: 'class', id: CLASS_ID, selected: true }],
  }),
);

describe('ReminderSyncController', () => {
  async function build(
    getSnapshot: jest.Mock,
    patch: jest.Mock = jest.fn(),
  ): Promise<ReminderSyncController> {
    const module = await Test.createTestingModule({
      controllers: [ReminderSyncController],
      providers: [
        { provide: ReminderSyncService, useValue: { getSnapshot } },
        { provide: ReminderSyncWriteService, useValue: { patch } },
      ],
    }).compile();
    return module.get(ReminderSyncController);
  }

  it('get() берёт аккаунт из гварда и отдаёт снимок сервиса как есть', async () => {
    const getSnapshot = jest.fn().mockResolvedValue(SNAPSHOT);
    const controller = await build(getSnapshot);

    await expect(controller.get(USER)).resolves.toEqual(SNAPSHOT);
    expect(getSnapshot).toHaveBeenCalledWith('u1');
  });

  it('patch() берёт аккаунт из гварда, изменения — из тела, и отдаёт снимок как есть', async () => {
    const patch = jest.fn().mockResolvedValue(SNAPSHOT);
    const controller = await build(jest.fn(), patch);

    const request = { headers: { 'content-type': 'application/json' }, body: BODY };
    await expect(controller.patch(USER, request)).resolves.toEqual(SNAPSHOT);
    expect(patch).toHaveBeenCalledWith('u1', [
      { kind: 'class', id: CLASS_ID, selected: true },
    ]);
  });

  it('patch() с чужим типом тела не доходит до сервиса', async () => {
    const patch = jest.fn();
    const controller = await build(jest.fn(), patch);

    expect(() =>
      controller.patch(USER, { headers: { 'content-type': 'text/plain' }, body: BODY }),
    ).toThrow(UnsupportedMediaTypeError);
    expect(patch).not.toHaveBeenCalled();
  });

  it.each(['get', 'patch'] as const)(
    '%s() помечен @AllowNativeBearer(): без метки bearer гвард не читает',
    (method) => {
      const handler: unknown = Object.getOwnPropertyDescriptor(
        ReminderSyncController.prototype,
        method,
      )?.value;
      expect(Reflect.getMetadata(ALLOW_NATIVE_BEARER_KEY, handler as object)).toBe(true);
    },
  );
});
