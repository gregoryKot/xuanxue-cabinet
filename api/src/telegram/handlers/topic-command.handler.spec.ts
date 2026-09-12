// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// фейковый ctx (маршрутизацию Telegraf проверяет telegram-bot.service.spec.ts).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { LessonRecord, LessonSchema } from '../../lessons/lesson.schema';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import type { TeacherChats } from '../teacher-chats';
import { buildTeacherChats } from '../test-support/build-teacher-chats';
import { TopicCommandHandler } from './topic-command.handler';

// Фиксированное «сейчас» (CLAUDE.md «Время»: детерминизм тестов) — не
// DateTime.utc() на каждый прогон, иначе тест мигает у полуночи по UTC.
const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

function fakeCtx(chatId: number | undefined, chatType: 'private' | 'group' = 'private') {
  const replies: { text: string; buttons?: unknown }[] = [];
  const ctx = {
    chat: chatId === undefined ? undefined : { id: chatId, type: chatType },
    reply: (text: string, extra?: { reply_markup?: { inline_keyboard: unknown } }) => {
      replies.push({ text, buttons: extra?.reply_markup?.inline_keyboard });
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, replies };
}

describe('TopicCommandHandler', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let channelModel: Model<ChannelRecord>;
  let userModel: Model<UserRecord>;
  let handler: TopicCommandHandler;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    handler = new TopicCommandHandler(
      buildTeacherChats(connection, new UsersService(userModel), channelModel),
      lessonModel,
      classModel,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      lessonModel.deleteMany({}),
      classModel.deleteMany({}),
      channelModel.deleteMany({}),
      userModel.deleteMany({}),
    ]);
  });

  async function seedTeacher(chatId: number): Promise<void> {
    await userModel.create({ name: 'Мария', telegramId: chatId, roles: ['teacher'] });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: String(chatId),
      active: true,
    });
  }

  it('ближайшие занятия — кнопки topic:{lessonId}', async () => {
    await seedTeacher(111);
    const cls = await classModel.create({
      title: 'цигун для глаз',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
    });
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ days: 1 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });

    const { ctx, replies } = fakeCtx(111);
    await handler.handle(ctx, NOW);

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toBe('Выберите занятие:');
    const buttons = replies[0]?.buttons as
      [{ text: string; callback_data: string }][] | undefined;
    expect(buttons).toHaveLength(1);
    expect(buttons?.[0]?.[0]?.text).toContain('цигун для глаз');
    expect(buttons?.[0]?.[0]?.callback_data).toBe(`topic:${lesson._id.toString()}`);
  });

  it('нет ближайших занятий — сообщение без кнопок', async () => {
    await seedTeacher(111);
    const { ctx, replies } = fakeCtx(111);

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([{ text: 'Ближайших занятий нет.', buttons: undefined }]);
  });

  it('чужой чат — тихо выходит', async () => {
    const { ctx, replies } = fakeCtx(999);

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('группа — игнорируется', async () => {
    await seedTeacher(111);
    const { ctx, replies } = fakeCtx(111, 'group');

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('класс выключен — его занятие в список не попадает', async () => {
    await seedTeacher(111);
    const cls = await classModel.create({
      title: 'выключенный класс',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: false,
      channelIds: [],
    });
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ days: 1 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });

    const { ctx, replies } = fakeCtx(111);
    await handler.handle(ctx, NOW);

    expect(replies).toEqual([{ text: 'Ближайших занятий нет.', buttons: undefined }]);
  });

  it('не более пяти занятий', async () => {
    await seedTeacher(111);
    const cls = await classModel.create({
      title: 'x',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
    });
    for (let i = 0; i < 7; i += 1) {
      await lessonModel.create({
        classId: cls._id,
        startsAt: NOW.plus({ days: i + 1 }).toJSDate(),
        durationMin: 60,
        status: 'scheduled',
      });
    }

    const { ctx, replies } = fakeCtx(111);
    await handler.handle(ctx, NOW);

    expect(replies[0]?.buttons).toHaveLength(5);
  });

  it('неожиданный сбой — логируется, не бросает', async () => {
    const failingHandler = new TopicCommandHandler(
      {
        list: jest.fn().mockRejectedValue(new Error('mongo упал')),
      } as unknown as TeacherChats,
      lessonModel,
      classModel,
    );
    const { ctx, replies } = fakeCtx(111);

    await expect(failingHandler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });
});
