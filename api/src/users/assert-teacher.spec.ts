// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): assertTeacherExists — общая проверка leaderId для ClassesService
// и LessonsService (аудит В4).
import type { Connection, Model } from 'mongoose';
import { assertLeaderIdIfProvided, assertTeacherExists } from './assert-teacher';
import { UserRecord, UserSchema } from './user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('assertTeacherExists', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('активный учитель — проходит', async () => {
    const teacher = await model.create({ name: 'Дмитрий', roles: ['teacher'] });
    await expect(
      assertTeacherExists(model, teacher._id.toString()),
    ).resolves.toBeUndefined();
  });

  it('активный админ — тоже проходит (ведёт занятие может и админ)', async () => {
    const admin = await model.create({ name: 'Мария', roles: ['admin'] });
    await expect(
      assertTeacherExists(model, admin._id.toString()),
    ).resolves.toBeUndefined();
  });

  it('ученик — ошибка «не найден среди учителей»', async () => {
    const student = await model.create({ name: 'Гриша', roles: [] });
    await expect(assertTeacherExists(model, student._id.toString())).rejects.toThrow(
      'не найден среди учителей',
    );
  });

  it('заблокированный учитель — ошибка', async () => {
    const blocked = await model.create({
      name: 'Дмитрий',
      roles: ['teacher'],
      status: 'blocked',
    });
    await expect(assertTeacherExists(model, blocked._id.toString())).rejects.toThrow(
      'не найден среди учителей',
    );
  });

  it('несуществующий id — ошибка', async () => {
    await expect(assertTeacherExists(model, '507f1f77bcf86cd799439011')).rejects.toThrow(
      'не найден среди учителей',
    );
  });

  it('невалидный ObjectId — та же ошибка, не 500', async () => {
    await expect(assertTeacherExists(model, 'not-an-id')).rejects.toThrow(
      'не найден среди учителей',
    );
  });
});

describe('assertLeaderIdIfProvided — обёртка для PATCH (ClassesService/LessonsService)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('undefined — поле не пришло в теле, проверка не запускается', async () => {
    await expect(assertLeaderIdIfProvided(model, undefined)).resolves.toBeUndefined();
  });

  it('null — явный сброс ведущего, проверка не запускается', async () => {
    await expect(assertLeaderIdIfProvided(model, null)).resolves.toBeUndefined();
  });

  it('строка с id ученика — та же ошибка, что у assertTeacherExists', async () => {
    const student = await model.create({ name: 'Гриша', roles: [] });
    await expect(assertLeaderIdIfProvided(model, student._id.toString())).rejects.toThrow(
      'не найден среди учителей',
    );
  });
});
