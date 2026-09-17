// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»). Общий
// connection на весь файл: `describe('list')` и `describe('listFor')` не
// поднимают каждый свой mongod — те же модели, разный набор тестов.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { PersonalChats } from './personal-chats';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

let memory: MemoryMongo;
let connection: Connection;
let userModel: Model<UserRecord>;
let channelModel: Model<ChannelRecord>;
let notificationPrefsModel: Model<NotificationPrefsRecord>;
let notificationPrefsService: NotificationPrefsService;
let personalChats: PersonalChats;

async function seedConnectedTeacher(telegramId: number, name: string): Promise<string> {
  const teacher = await userModel.create({ name, telegramId, roles: ['teacher'] });
  await channelModel.create({
    type: 'telegram',
    title: `Личные сообщения: ${name}`,
    config: '{}',
    target: String(telegramId),
    active: true,
  });
  return teacher._id.toString();
}

beforeAll(async () => {
  memory = await openMemoryMongo();
  connection = memory.connection;
  userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
  channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  notificationPrefsModel = connection.model<NotificationPrefsRecord>(
    NotificationPrefsRecord.name,
  );
  notificationPrefsService = new NotificationPrefsService(notificationPrefsModel);
  personalChats = new PersonalChats(
    new UsersService(userModel),
    channelModel,
    notificationPrefsService,
  );
}, 60_000);

afterAll(async () => {
  await memory.stop();
});

afterEach(async () => {
  await userModel.deleteMany({});
  await channelModel.deleteMany({});
  await notificationPrefsModel.deleteMany({});
});

describe('PersonalChats.list', () => {
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

    const chats = await personalChats.list(NOW);

    expect(chats).toEqual([
      { chatId: '111', userId: teacher._id.toString(), name: 'Мария' },
    ]);
  });

  it('учитель без /start (канала нет) — не в списке', async () => {
    await userModel.create({ name: 'Дима', telegramId: 222, roles: ['admin'] });

    const chats = await personalChats.list(NOW);

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

    const chats = await personalChats.list(NOW);

    expect(chats).toEqual([]);
  });

  it('ученик (без ролей) с личным каналом — не в списке: не учитель и не админ', async () => {
    await userModel.create({ name: 'Ученик', telegramId: 444, roles: [] });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '444',
      active: true,
    });

    const chats = await personalChats.list(NOW);

    expect(chats).toEqual([]);
  });

  // Помощник учителя правами равен учителю (CLAUDE.md, docs/PLAN.md §«Роли») —
  // бот пишет ему так же, как учителю.
  it('помощник учителя с активным личным каналом — в списке', async () => {
    const assistant = await userModel.create({
      name: 'Пётр',
      telegramId: 555,
      roles: ['assistant'],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'Личные сообщения: Пётр',
      config: '{}',
      target: '555',
      active: true,
    });

    const chats = await personalChats.list(NOW);

    expect(chats).toEqual([
      { chatId: '555', userId: assistant._id.toString(), name: 'Пётр' },
    ]);
  });

  it('бухгалтер с личным каналом — не в списке: прав нет, деньги — этап 3', async () => {
    await userModel.create({ name: 'Бухгалтер', telegramId: 666, roles: ['accountant'] });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '666',
      active: true,
    });

    const chats = await personalChats.list(NOW);

    expect(chats).toEqual([]);
  });

  it('пустой список — warn один раз в час, не на каждый вызов', async () => {
    // Свой инстанс, не общий `personalChats` из describe: тесты выше уже
    // видели пустой список на том же NOW (например «канал выключен») и
    // выставили lastEmptyWarnAt на общем инстансе — с ним диф был бы 0.
    const freshChats = new PersonalChats(
      new UsersService(userModel),
      channelModel,
      notificationPrefsService,
    );
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Два вызова в пределах часа — один и тот же warn, второй раз не дублируется.
    await freshChats.list(NOW);
    await freshChats.list(NOW.plus({ minutes: 1 }));
    expect(warn).toHaveBeenCalledTimes(1);

    // Третий вызов через 61 минуту после первого — час истёк, warn снова.
    await freshChats.list(NOW.plus({ minutes: 61 }));
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });
});

describe('PersonalChats.listFor', () => {
  it('дефолт роли — учитель в списке для post_draft, без единого переключения', async () => {
    const teacherId = await seedConnectedTeacher(111, 'Мария');

    const chats = await personalChats.listFor('post_draft', NOW);

    expect(chats).toEqual([{ chatId: '111', userId: teacherId, name: 'Мария' }]);
  });

  it('выключил post_draft — его нет в listFor(post_draft), другой учитель остаётся', async () => {
    const offId = await seedConnectedTeacher(111, 'Мария');
    await seedConnectedTeacher(222, 'Пётр');
    await notificationPrefsModel.create({
      userId: offId,
      overrides: [{ kind: 'post_draft', enabled: false }],
    });

    const chats = await personalChats.listFor('post_draft', NOW);

    expect(chats.map((c) => c.name)).toEqual(['Пётр']);
  });

  it('выключил post_draft — recording_request у него не задет (переключатели по виду отдельные)', async () => {
    const offId = await seedConnectedTeacher(111, 'Мария');
    await notificationPrefsModel.create({
      userId: offId,
      overrides: [{ kind: 'post_draft', enabled: false }],
    });

    const chats = await personalChats.listFor('recording_request', NOW);

    expect(chats.map((c) => c.name)).toEqual(['Мария']);
  });

  it('все выключили вид — пустой список, не бросает', async () => {
    const offId = await seedConnectedTeacher(111, 'Мария');
    await notificationPrefsModel.create({
      userId: offId,
      overrides: [{ kind: 'delivery_failed', enabled: false }],
    });

    await expect(personalChats.listFor('delivery_failed', NOW)).resolves.toEqual([]);
  });

  it('одна выборка notification_prefs на весь список, не по человеку в цикле', async () => {
    await seedConnectedTeacher(111, 'Мария');
    await seedConnectedTeacher(222, 'Пётр');
    await seedConnectedTeacher(333, 'Ольга');
    const getManySpy = jest.spyOn(NotificationPrefsService.prototype, 'getManyEnabled');

    await personalChats.listFor('post_draft', NOW);

    expect(getManySpy).toHaveBeenCalledTimes(1);
    expect(getManySpy.mock.calls[0]?.[0]).toHaveLength(3);
    getManySpy.mockRestore();
  });

  it('пустой список для вида — debug раз в час, не warn и не на каждый вызов', async () => {
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const freshChats = new PersonalChats(
      new UsersService(userModel),
      channelModel,
      notificationPrefsService,
    );

    await freshChats.listFor('post_draft', NOW);
    await freshChats.listFor('post_draft', NOW.plus({ minutes: 1 }));
    expect(debug).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();

    await freshChats.listFor('post_draft', NOW.plus({ minutes: 61 }));
    expect(debug).toHaveBeenCalledTimes(2);

    debug.mockRestore();
    warn.mockRestore();
  });
});
