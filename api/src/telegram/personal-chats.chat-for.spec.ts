// chatFor() — отдельный файл от personal-chats.spec.ts (list()/listFor()
// уже на границе спек-лимита в 300 строк, CLAUDE.md «Храповики», тот же
// приём, что exam-attempts.time.spec.ts). Против настоящей Mongo
// (mongodb-memory-server — CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { PersonalChats } from './personal-chats';

const NOW = DateTime.fromISO('2026-09-13T09:00:00Z', { zone: 'utc' });

let memory: MemoryMongo;
let connection: Connection;
let userModel: Model<UserRecord>;
let channelModel: Model<ChannelRecord>;
let notificationPrefsModel: Model<NotificationPrefsRecord>;
let personalChats: PersonalChats;

beforeAll(async () => {
  memory = await openMemoryMongo();
  connection = memory.connection;
  userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
  channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  notificationPrefsModel = connection.model<NotificationPrefsRecord>(
    NotificationPrefsRecord.name,
  );
  personalChats = new PersonalChats(
    new UsersService(userModel),
    channelModel,
    new NotificationPrefsService(notificationPrefsModel),
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

describe('PersonalChats.chatFor', () => {
  it('ученик с активным личным каналом и включённым видом (дефолт роли) — чат найден', async () => {
    const student = await userModel.create({
      name: 'Ольга',
      telegramId: 111,
      roles: [],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '111',
      active: true,
    });

    const chat = await personalChats.chatFor(student._id.toString(), 'exam_result');

    expect(chat).toEqual({
      chatId: '111',
      userId: student._id.toString(),
      name: 'Ольга',
    });
  });

  it('человека с таким id нет — null, не бросает', async () => {
    await expect(
      personalChats.chatFor('507f1f77bcf86cd799439011', 'exam_result'),
    ).resolves.toBeNull();
  });

  it('заблокирован — null, уведомление не уходит (SECURITY §9)', async () => {
    const student = await userModel.create({
      name: 'Ольга',
      telegramId: 666,
      roles: [],
      status: 'blocked',
    });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '666',
      active: true,
    });

    await expect(
      personalChats.chatFor(student._id.toString(), 'exam_result'),
    ).resolves.toBeNull();
  });

  it('есть аккаунт, но не подключал бота (telegramId не задан) — null', async () => {
    const student = await userModel.create({ name: 'Ольга', roles: [] });

    await expect(
      personalChats.chatFor(student._id.toString(), 'exam_result'),
    ).resolves.toBeNull();
  });

  it('telegramId есть, но /start не нажимал (канала нет) — null', async () => {
    const student = await userModel.create({
      name: 'Ольга',
      telegramId: 222,
      roles: [],
    });

    await expect(
      personalChats.chatFor(student._id.toString(), 'exam_result'),
    ).resolves.toBeNull();
  });

  it('канал есть, но выключен — null', async () => {
    const student = await userModel.create({
      name: 'Ольга',
      telegramId: 333,
      roles: [],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '333',
      active: false,
    });

    await expect(
      personalChats.chatFor(student._id.toString(), 'exam_result'),
    ).resolves.toBeNull();
  });

  it('канал активен, но человек выключил именно этот вид — null', async () => {
    const student = await userModel.create({
      name: 'Ольга',
      telegramId: 444,
      roles: [],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '444',
      active: true,
    });
    await notificationPrefsModel.create({
      userId: student._id.toString(),
      overrides: [{ kind: 'exam_result', enabled: false }],
    });

    await expect(
      personalChats.chatFor(student._id.toString(), 'exam_result'),
    ).resolves.toBeNull();
  });

  it('работает для любой роли, не только штата школы — в отличие от list()/listFor()', async () => {
    const accountant = await userModel.create({
      name: 'Бухгалтер',
      telegramId: 555,
      roles: ['accountant'],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '555',
      active: true,
    });

    const chat = await personalChats.chatFor(accountant._id.toString(), 'payments');

    expect(chat?.chatId).toBe('555');
    // list()/listFor() бухгалтера в принципе не видят (personal-chats.spec.ts) —
    // chatFor() не сверяется со штатом, это и есть разница механики.
    await expect(personalChats.listFor('payments', NOW)).resolves.toEqual([]);
  });
});

// hasActiveChat() — почтовый резерв уведомлений экзамена спрашивает именно
// про существование чата, без вида уведомления (слой 4.7, ADR-0039,
// MailExamNotifier). В отличие от chatFor() выше не завязан на конкретный
// NotificationKind.
describe('PersonalChats.hasActiveChat', () => {
  it('активный личный канал — true', async () => {
    const student = await userModel.create({ name: 'Ольга', telegramId: 777, roles: [] });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '777',
      active: true,
    });

    await expect(personalChats.hasActiveChat(student._id.toString())).resolves.toBe(true);
  });

  it('telegramId не задан — false', async () => {
    const student = await userModel.create({ name: 'Ольга', roles: [] });

    await expect(personalChats.hasActiveChat(student._id.toString())).resolves.toBe(
      false,
    );
  });

  it('канал есть, но выключен — false', async () => {
    const student = await userModel.create({ name: 'Ольга', telegramId: 888, roles: [] });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '888',
      active: false,
    });

    await expect(personalChats.hasActiveChat(student._id.toString())).resolves.toBe(
      false,
    );
  });

  it('заблокирован — false, тот же инвариант, что chatFor (SECURITY §9)', async () => {
    const student = await userModel.create({
      name: 'Ольга',
      telegramId: 999,
      roles: [],
      status: 'blocked',
    });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '999',
      active: true,
    });

    await expect(personalChats.hasActiveChat(student._id.toString())).resolves.toBe(
      false,
    );
  });

  it('человека с таким id нет — false, не бросает', async () => {
    await expect(personalChats.hasActiveChat('507f1f77bcf86cd799439011')).resolves.toBe(
      false,
    );
  });
});
