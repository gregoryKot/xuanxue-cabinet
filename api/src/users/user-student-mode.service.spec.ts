// Против настоящей Mongo (mongodb-memory-server, CLAUDE.md «Тесты»): режим
// ученика для штата (ADR-0163). Образец — user-no-telegram.service.spec.ts.
// Read-after-write — через UsersService.findById, как делает AuthGuard, а не
// только по возврату setStudentMode.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { STUDENT_MODE_STAFF_ONLY_MESSAGE } from '@xuanxue/shared';
import { ForbiddenError } from '../common/errors';
import { UserRecord, UserSchema } from './user.schema';
import { UserStudentModeService } from './user-student-mode.service';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-10-01T10:00:00Z');
const LATER = DateTime.fromISO('2026-10-02T11:00:00Z');

describe('UserStudentModeService.setStudentMode', () => {
  let memory: MemoryMongo;
  let model: Model<UserRecord>;
  let service: UserStudentModeService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    service = new UserStudentModeService(model);
    users = new UsersService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  async function person(roles: UserRecord['roles']): Promise<string> {
    const doc = await model.create({ name: 'Человек', roles, status: 'active' });
    return doc._id.toString();
  }

  async function rawStudentModeAt(id: string): Promise<Date | undefined> {
    const doc = await model.findById(id).lean();
    return doc?.studentModeAt;
  }

  it('невалидный ObjectId и несуществующий id — NotFoundError, не падение', async () => {
    await expect(service.setStudentMode('не-objectid', true, NOW)).rejects.toThrow(
      'Пользователь не найден',
    );
    await expect(
      service.setStudentMode('507f1f77bcf86cd799439011', false, NOW),
    ).rejects.toThrow('Пользователь не найден');
    await expect(
      service.setStudentMode('507f1f77bcf86cd799439011', true, NOW),
    ).rejects.toThrow('Пользователь не найден');
  });

  it.each([['teacher'], ['assistant'], ['admin']] as const)(
    '%s включает режим: момент в БД, studentMode true, настоящие роли на месте',
    async (role) => {
      const id = await person([role]);

      const updated = await service.setStudentMode(id, true, NOW);

      expect(updated.studentMode).toBe(true);
      expect(updated.roles).toEqual([role]);
      expect(await rawStudentModeAt(id)).toEqual(NOW.toJSDate());
      const found = await users.findById(id);
      expect(found).toMatchObject({ studentMode: true, roles: [role] });
    },
  );

  it('повторное включение момент не затирает: ретрай ничего не меняет', async () => {
    const id = await person(['teacher']);
    await service.setStudentMode(id, true, NOW);

    const again = await service.setStudentMode(id, true, LATER);

    expect(again.studentMode).toBe(true);
    expect(await rawStudentModeAt(id)).toEqual(NOW.toJSDate());
  });

  it('выключение снимает поле целиком ($unset), роли не тронуты, включить снова можно', async () => {
    const id = await person(['admin', 'teacher']);
    await service.setStudentMode(id, true, NOW);

    const off = await service.setStudentMode(id, false, LATER);

    expect(off).toMatchObject({ studentMode: false, roles: ['admin', 'teacher'] });
    const raw = await model.findById(id).lean();
    expect(raw).not.toHaveProperty('studentModeAt');
    expect(await users.findById(id)).toMatchObject({ studentMode: false });

    const on = await service.setStudentMode(id, true, LATER);
    expect(on.studentMode).toBe(true);
    expect(await rawStudentModeAt(id)).toEqual(LATER.toJSDate());
  });

  it('ученик без ролей включить не может: ForbiddenError, в БД ничего не появилось', async () => {
    const id = await person([]);

    const attempt = service.setStudentMode(id, true, NOW);

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt).rejects.toThrow(STUDENT_MODE_STAFF_ONLY_MESSAGE);
    expect(await rawStudentModeAt(id)).toBeUndefined();
  });

  it('бухгалтер — не штат: включить не может', async () => {
    const id = await person(['accountant']);

    await expect(service.setStudentMode(id, true, NOW)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await rawStudentModeAt(id)).toBeUndefined();
  });

  it('выключить можно всегда, даже ученику: без ролей и без режима — тихий no-op', async () => {
    const id = await person([]);

    const result = await service.setStudentMode(id, false, NOW);

    expect(result).toMatchObject({ studentMode: false, roles: [] });
  });

  it('флаг застрял после снятия штата: UserLean.studentMode false, выключить всё равно можно', async () => {
    const id = await person(['teacher']);
    await service.setStudentMode(id, true, NOW);
    // Роли сняты мимо экрана «Люди» (правка в Atlas): флаг остался в БД.
    await model.updateOne({ _id: id }, { $set: { roles: [] } });

    expect(await users.findById(id)).toMatchObject({ studentMode: false, roles: [] });
    expect(await rawStudentModeAt(id)).toEqual(NOW.toJSDate());

    await service.setStudentMode(id, false, LATER);
    expect(await rawStudentModeAt(id)).toBeUndefined();
  });
});
