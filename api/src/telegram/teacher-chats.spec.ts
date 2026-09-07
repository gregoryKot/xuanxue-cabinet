// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { TeacherChats } from './teacher-chats';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('TeacherChats', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let teacherChats: TeacherChats;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    teacherChats = new TeacherChats(new UsersService(userModel), channelModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
  });

  it('учитель с активным личным каналом — в списке', async () => {
    const teacher = await userModel.create({
      name: 'Мария',
      telegramId: 111,
      roles: ['teacher'],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'Личные сообщения: Мария',
      config: '{}',
      target: '111',
      active: true,
    });

    const chats = await teacherChats.list(NOW);

    expect(chats).toEqual([
      { chatId: '111', userId: teacher._id.toString(), name: 'Мария' },
    ]);
  });

  it('учитель без /start (канала нет) — не в списке', async () => {
    await userModel.create({ name: 'Дима', telegramId: 222, roles: ['admin'] });

    const chats = await teacherChats.list(NOW);

    expect(chats).toEqual([]);
  });

  it('канал есть, но выключен (кикнули бота) — не в списке', async () => {
    await userModel.create({ name: 'Ольга', telegramId: 333, roles: ['teacher'] });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '333',
      active: false,
    });

    const chats = await teacherChats.list(NOW);

    expect(chats).toEqual([]);
  });

  it('ученик (роль student) с личным каналом — не в списке: не учитель и не админ', async () => {
    await userModel.create({ name: 'Ученик', telegramId: 444, roles: ['student'] });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '444',
      active: true,
    });

    const chats = await teacherChats.list(NOW);

    expect(chats).toEqual([]);
  });

  it('пустой список — не падает, повторный вызов раньше часа не дублирует warn (по факту не бросает)', async () => {
    await expect(teacherChats.list(NOW)).resolves.toEqual([]);
    await expect(teacherChats.list(NOW.plus({ minutes: 1 }))).resolves.toEqual([]);
  });
});
