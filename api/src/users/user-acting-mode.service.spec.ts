// Против настоящей Mongo (mongodb-memory-server, CLAUDE.md «Тесты»): режим
// ученика для штата (ADR-0163) и режим учителя для админа (ADR-0190), один сервис.
// Образец — user-no-telegram.service.spec.ts. Read-after-write — через
// UsersService.findById, как делает AuthGuard, а не только по возврату setMode.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  STUDENT_MODE_STAFF_ONLY_MESSAGE,
  TEACHER_MODE_ADMIN_ONLY_MESSAGE,
} from '@xuanxue/shared';
import { ForbiddenError } from '../common/errors';
import { UserRecord, UserSchema } from './user.schema';
import { UserActingModeService } from './user-acting-mode.service';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-10-01T10:00:00Z');
const LATER = DateTime.fromISO('2026-10-02T11:00:00Z');

describe('UserActingModeService.setMode', () => {
  let memory: MemoryMongo;
  let model: Model<UserRecord>;
  let service: UserActingModeService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    service = new UserActingModeService(model);
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

  async function rawTeacherModeAt(id: string): Promise<Date | undefined> {
    const doc = await model.findById(id).lean();
    return doc?.teacherModeAt;
  }

  it('невалидный ObjectId и несуществующий id — NotFoundError, не падение', async () => {
    await expect(service.setMode('student', 'не-objectid', true, NOW)).rejects.toThrow(
      'Пользователь не найден',
    );
    await expect(
      service.setMode('student', '507f1f77bcf86cd799439011', false, NOW),
    ).rejects.toThrow('Пользователь не найден');
    await expect(
      service.setMode('student', '507f1f77bcf86cd799439011', true, NOW),
    ).rejects.toThrow('Пользователь не найден');
  });

  it.each([['teacher'], ['assistant'], ['admin']] as const)(
    '%s включает режим: момент в БД, studentMode true, настоящие роли на месте',
    async (role) => {
      const id = await person([role]);

      const updated = await service.setMode('student', id, true, NOW);

      expect(updated.studentMode).toBe(true);
      expect(updated.roles).toEqual([role]);
      expect(await rawStudentModeAt(id)).toEqual(NOW.toJSDate());
      const found = await users.findById(id);
      expect(found).toMatchObject({ studentMode: true, roles: [role] });
    },
  );

  it('повторное включение момент не затирает: ретрай ничего не меняет', async () => {
    const id = await person(['teacher']);
    await service.setMode('student', id, true, NOW);

    const again = await service.setMode('student', id, true, LATER);

    expect(again.studentMode).toBe(true);
    expect(await rawStudentModeAt(id)).toEqual(NOW.toJSDate());
  });

  it('выключение снимает поле целиком ($unset), роли не тронуты, включить снова можно', async () => {
    const id = await person(['admin', 'teacher']);
    await service.setMode('student', id, true, NOW);

    const off = await service.setMode('student', id, false, LATER);

    expect(off).toMatchObject({ studentMode: false, roles: ['admin', 'teacher'] });
    const raw = await model.findById(id).lean();
    expect(raw).not.toHaveProperty('studentModeAt');
    expect(await users.findById(id)).toMatchObject({ studentMode: false });

    const on = await service.setMode('student', id, true, LATER);
    expect(on.studentMode).toBe(true);
    expect(await rawStudentModeAt(id)).toEqual(LATER.toJSDate());
  });

  it('ученик без ролей включить не может: ForbiddenError, в БД ничего не появилось', async () => {
    const id = await person([]);

    const attempt = service.setMode('student', id, true, NOW);

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt).rejects.toThrow(STUDENT_MODE_STAFF_ONLY_MESSAGE);
    expect(await rawStudentModeAt(id)).toBeUndefined();
  });

  it('бухгалтер — не штат: включить не может', async () => {
    const id = await person(['accountant']);

    await expect(service.setMode('student', id, true, NOW)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await rawStudentModeAt(id)).toBeUndefined();
  });

  it('выключить можно всегда, даже ученику: без ролей и без режима — тихий no-op', async () => {
    const id = await person([]);

    const result = await service.setMode('student', id, false, NOW);

    expect(result).toMatchObject({ studentMode: false, roles: [] });
  });

  it('флаг застрял после снятия штата: UserLean.studentMode false, выключить всё равно можно', async () => {
    const id = await person(['teacher']);
    await service.setMode('student', id, true, NOW);
    // Роли сняты мимо экрана «Люди» (правка в Atlas): флаг остался в БД.
    await model.updateOne({ _id: id }, { $set: { roles: [] } });

    expect(await users.findById(id)).toMatchObject({ studentMode: false, roles: [] });
    expect(await rawStudentModeAt(id)).toEqual(NOW.toJSDate());

    await service.setMode('student', id, false, LATER);
    expect(await rawStudentModeAt(id)).toBeUndefined();
  });

  describe('режим учителя (ADR-0190)', () => {
    it('невалидный ObjectId и несуществующий id — NotFoundError, как у режима ученика', async () => {
      await expect(service.setMode('teacher', 'не-objectid', true, NOW)).rejects.toThrow(
        'Пользователь не найден',
      );
      await expect(
        service.setMode('teacher', '507f1f77bcf86cd799439011', true, NOW),
      ).rejects.toThrow('Пользователь не найден');
    });

    it('админ включает: момент в БД, teacherMode true, настоящие роли на месте, режима ученика нет', async () => {
      const id = await person(['admin']);

      const updated = await service.setMode('teacher', id, true, NOW);

      expect(updated).toMatchObject({
        teacherMode: true,
        studentMode: false,
        roles: ['admin'],
      });
      expect(await rawTeacherModeAt(id)).toEqual(NOW.toJSDate());
      expect(await users.findById(id)).toMatchObject({
        teacherMode: true,
        roles: ['admin'],
      });
    });

    it.each([[['teacher']], [['assistant']], [['accountant']], [[]]] as const)(
      'без роли admin (%j) включить нельзя: ForbiddenError, в БД ничего не появилось',
      async (roles) => {
        const id = await person([...roles]);

        const attempt = service.setMode('teacher', id, true, NOW);

        await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
        await expect(attempt).rejects.toThrow(TEACHER_MODE_ADMIN_ONLY_MESSAGE);
        expect(await rawTeacherModeAt(id)).toBeUndefined();
      },
    );

    it('повторное включение момент не затирает: ретрай ничего не меняет', async () => {
      const id = await person(['admin']);
      await service.setMode('teacher', id, true, NOW);

      const again = await service.setMode('teacher', id, true, LATER);

      expect(again.teacherMode).toBe(true);
      expect(await rawTeacherModeAt(id)).toEqual(NOW.toJSDate());
    });

    it('выключение снимает поле целиком ($unset), роли не тронуты, включить снова можно', async () => {
      const id = await person(['admin', 'teacher']);
      await service.setMode('teacher', id, true, NOW);

      const off = await service.setMode('teacher', id, false, LATER);

      expect(off).toMatchObject({ teacherMode: false, roles: ['admin', 'teacher'] });
      expect(await model.findById(id).lean()).not.toHaveProperty('teacherModeAt');
      const on = await service.setMode('teacher', id, true, LATER);
      expect(on.teacherMode).toBe(true);
      expect(await rawTeacherModeAt(id)).toEqual(LATER.toJSDate());
    });

    it.each([[['teacher']], [[]]] as const)(
      'выключить можно всегда, даже без admin (%j): тихий no-op',
      async (roles) => {
        const id = await person([...roles]);

        const result = await service.setMode('teacher', id, false, NOW);

        expect(result).toMatchObject({ teacherMode: false });
      },
    );

    it('флаг застрял после потери admin: UserLean.teacherMode false, выключить всё равно можно', async () => {
      const id = await person(['admin']);
      await service.setMode('teacher', id, true, NOW);
      // Роль снята мимо экрана «Люди» (правка в Atlas): флаг остался в БД.
      await model.updateOne({ _id: id }, { $set: { roles: ['teacher'] } });

      expect(await users.findById(id)).toMatchObject({
        teacherMode: false,
        roles: ['teacher'],
      });
      expect(await rawTeacherModeAt(id)).toEqual(NOW.toJSDate());

      await service.setMode('teacher', id, false, LATER);
      expect(await rawTeacherModeAt(id)).toBeUndefined();
    });
  });

  describe('два режима взаимоисключающие', () => {
    it('учитель включается поверх ученика: тем же апдейтом ученика нет', async () => {
      const id = await person(['admin']);
      await service.setMode('student', id, true, NOW);

      const updated = await service.setMode('teacher', id, true, LATER);

      expect(updated).toMatchObject({ teacherMode: true, studentMode: false });
      expect(await rawStudentModeAt(id)).toBeUndefined();
      expect(await rawTeacherModeAt(id)).toEqual(LATER.toJSDate());
    });

    it('ученик включается поверх учителя: тем же апдейтом учителя нет', async () => {
      const id = await person(['admin']);
      await service.setMode('teacher', id, true, NOW);

      const updated = await service.setMode('student', id, true, LATER);

      expect(updated).toMatchObject({ studentMode: true, teacherMode: false });
      expect(await rawTeacherModeAt(id)).toBeUndefined();
      expect(await rawStudentModeAt(id)).toEqual(LATER.toJSDate());
      expect(await users.findById(id)).toMatchObject({
        studentMode: true,
        teacherMode: false,
      });
    });

    it('выключение одного режима соседний не трогает (его и так нет, но запись не лишняя)', async () => {
      const id = await person(['admin']);
      await service.setMode('student', id, true, NOW);

      await service.setMode('teacher', id, false, LATER);

      expect(await rawStudentModeAt(id)).toEqual(NOW.toJSDate());
    });

    it('учитель без admin включает ученика: штат вправе, режим учителя на нём не появляется', async () => {
      const id = await person(['teacher']);

      const updated = await service.setMode('student', id, true, NOW);

      expect(updated).toMatchObject({ studentMode: true, teacherMode: false });
      expect(await rawTeacherModeAt(id)).toBeUndefined();
    });
  });
});
