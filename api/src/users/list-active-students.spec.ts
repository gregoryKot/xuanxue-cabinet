// Против настоящей Mongo (CLAUDE.md «Тесты»: мок пропускает ошибки самого
// запроса) — фильтр «активные и без единой роли» (ADR-0026).
import type { Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { listActiveStudents } from './list-active-students';
import { UserRecord, UserSchema } from './user.schema';

describe('listActiveStudents', () => {
  let memory: MemoryMongo;
  let model: Model<UserRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('активный человек без ролей — попадает в список', async () => {
    const student = await model.create({ name: 'Ваня', roles: [], status: 'active' });

    const result = await listActiveStudents(model);

    expect(result).toEqual([{ id: student._id.toString(), name: 'Ваня' }]);
  });

  it('человек с ролью (учитель) — не ученик, в список не попадает', async () => {
    await model.create({ name: 'Мария', roles: ['teacher'], status: 'active' });

    expect(await listActiveStudents(model)).toEqual([]);
  });

  it('заблокированный ученик — не получает новых уведомлений ни в одном канале', async () => {
    await model.create({ name: 'Ваня', roles: [], status: 'blocked' });

    expect(await listActiveStudents(model)).toEqual([]);
  });

  // ADR-0163: по умолчанию штат в режиме ученика НЕ ученик — оплаты и
  // статистика зовут функцию без флага и остаются про настоящих людей.
  describe('штат в режиме ученика (ADR-0163)', () => {
    const MOMENT = new Date('2026-10-01T10:00:00Z');

    it('без includeStudentMode в списке только настоящие ученики', async () => {
      const student = await model.create({ name: 'Ваня', roles: [], status: 'active' });
      await model.create({
        name: 'Мария',
        roles: ['teacher'],
        status: 'active',
        studentModeAt: MOMENT,
      });

      const result = await listActiveStudents(model);

      expect(result.map((r) => r.id)).toEqual([student._id.toString()]);
    });

    it('с includeStudentMode учитель в режиме — в списке, вместе с учеником', async () => {
      const student = await model.create({ name: 'Ваня', roles: [], status: 'active' });
      const teacher = await model.create({
        name: 'Мария',
        roles: ['teacher'],
        status: 'active',
        studentModeAt: MOMENT,
      });

      const result = await listActiveStudents(model, { includeStudentMode: true });

      expect(result.map((r) => r.id).sort()).toEqual(
        [student._id.toString(), teacher._id.toString()].sort(),
      );
    });

    it('штат без режима и в списке с includeStudentMode не появляется', async () => {
      await model.create({ name: 'Мария', roles: ['admin'], status: 'active' });

      expect(await listActiveStudents(model, { includeStudentMode: true })).toEqual([]);
    });

    it('застрявший флаг у бухгалтера и у человека без ролей-штата — не режим', async () => {
      await model.create({
        name: 'Бухгалтер',
        roles: ['accountant'],
        status: 'active',
        studentModeAt: MOMENT,
      });

      expect(await listActiveStudents(model, { includeStudentMode: true })).toEqual([]);
    });

    it('заблокированный штат в режиме — не в списке', async () => {
      await model.create({
        name: 'Мария',
        roles: ['teacher'],
        status: 'blocked',
        studentModeAt: MOMENT,
      });

      expect(await listActiveStudents(model, { includeStudentMode: true })).toEqual([]);
    });
  });

  it('несколько активных учеников — все в списке', async () => {
    const a = await model.create({ name: 'Ваня', roles: [], status: 'active' });
    const b = await model.create({ name: 'Настя', roles: [], status: 'active' });

    const result = await listActiveStudents(model);

    expect(result.map((r) => r.id).sort()).toEqual(
      [a._id.toString(), b._id.toString()].sort(),
    );
  });
});
