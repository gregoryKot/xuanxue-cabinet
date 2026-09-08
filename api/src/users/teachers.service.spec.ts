// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// фильтр по роли/статусу, сортировка, без ПДн в ответе.
import type { Connection, Model } from 'mongoose';
import { TeachersService } from './teachers.service';
import { UserRecord, UserSchema } from './user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('TeachersService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;
  let service: TeachersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
    service = new TeachersService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('teacher и admin с активным статусом — оба в списке, по алфавиту', async () => {
    await model.create({ name: 'Ярослав', roles: ['teacher'] });
    await model.create({ name: 'Анна', roles: ['admin'] });

    const teachers = await service.listTeachers();

    expect(teachers.map((t) => t.name)).toEqual(['Анна', 'Ярослав']);
  });

  it('ученик, гость и заблокированный учитель — не в списке', async () => {
    await model.create({ name: 'Ученик', roles: ['student'] });
    await model.create({ name: 'Гость', roles: [] });
    await model.create({ name: 'Уволенный', roles: ['teacher'], status: 'blocked' });

    const teachers = await service.listTeachers();

    expect(teachers).toEqual([]);
  });

  it('ответ — только id и name, без телеграма и остальных ПДн', async () => {
    const created = await model.create({
      name: 'Дмитрий',
      roles: ['teacher'],
      telegramId: 555,
      email: 'd@example.com',
    });

    const teachers = await service.listTeachers();

    expect(teachers).toEqual([{ id: created._id.toString(), name: 'Дмитрий' }]);
  });
});
