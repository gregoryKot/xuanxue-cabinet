// Против настоящей Mongo (CLAUDE.md «Тесты»): доступ к меню (штат — личный
// чат подключённого учителя/помощника/админа, ученик и незнакомец —
// BotUserAccessService, ADR-0065) и содержимое экранов. Сам текст экранов
// проверяют bot-menu.spec.ts и bot-schedule.spec.ts — здесь то, что без базы
// не проверишь.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { LessonRecord, LessonSchema } from '../../lessons/lesson.schema';
import { MyLessonsService } from '../../lessons/my-lessons.service';
import { SettingsRecord, SettingsSchema } from '../../settings/settings.schema';
import { SettingsService } from '../../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { buildPersonalChats } from '../test-support/build-personal-chats';
import { seedTeacher } from '../test-support/seed-teacher';
import { MenuCommandHandler } from './menu-command.handler';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

function fakeCtx(
  chatId: number | undefined,
  chatType: 'private' | 'group' = 'private',
  failReply = false,
): { ctx: Context; replies: { text: string; buttons?: unknown }[] } {
  const replies: { text: string; buttons?: unknown }[] = [];
  const ctx = {
    chat: chatId === undefined ? undefined : { id: chatId, type: chatType },
    reply: (text: string, extra?: { reply_markup?: { inline_keyboard: unknown } }) => {
      if (failReply) return Promise.reject(new Error('бот заблокирован'));
      replies.push({ text, buttons: extra?.reply_markup?.inline_keyboard });
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, replies };
}

describe('MenuCommandHandler', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let settingsModel: Model<SettingsRecord>;
  let settingsService: SettingsService;
  let handler: MenuCommandHandler;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    settingsModel = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    const usersService = new UsersService(userModel);
    settingsService = new SettingsService(
      settingsModel,
      lessonModel,
      classModel,
      usersService,
    );
    handler = new MenuCommandHandler(
      buildPersonalChats(connection, usersService, channelModel),
      new MyLessonsService(lessonModel, classModel),
      new BotUserAccessService(usersService),
      settingsService,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      userModel.deleteMany({}),
      channelModel.deleteMany({}),
      classModel.deleteMany({}),
      lessonModel.deleteMany({}),
      settingsModel.deleteMany({}),
    ]);
  });

  async function seedLesson(startsAt: string): Promise<void> {
    const cls = await classModel.create({
      title: 'Цигун для глаз',
      groupLabel: 'группа А',
      format: 'online',
      zoomLink: 'https://zoom.us/j/1',
      leadMinutes: 30,
      tz: 'Asia/Jerusalem',
      rules: [],
      channelIds: [],
      active: true,
    });
    await lessonModel.create({
      classId: cls._id,
      startsAt: new Date(startsAt),
      durationMin: 60,
      status: 'scheduled',
    });
  }

  it('меню в личном чате учителя — текст с кнопками экранов', async () => {
    await seedTeacher(userModel, channelModel, 111);
    const { ctx, replies } = fakeCtx(111);

    await handler.showMenu(ctx, NOW);

    expect(replies).toHaveLength(1);
    expect(replies[0]?.buttons).toEqual([
      [{ text: 'Ближайшие занятия', callback_data: 'menu:schedule' }],
      [{ text: 'Экзамены', callback_data: 'menu:exams' }],
      [{ text: 'Новый вопрос', callback_data: 'menu:newitem' }],
      [{ text: 'Собрать экзамен', callback_data: 'menu:newexam' }],
      [{ text: 'Уведомления', callback_data: 'menu:notifications' }],
    ]);
  });

  // Регрессия на баг от владельца 2026-09-21: «зашёл в бот с ученика —
  // ничего не работает, даже хелп» — resolvePrivatePersonalChatId проверял
  // только штат, и всем остальным, включая незнакомца, хендлер молча
  // выходил. Теперь незнакомец получает тот же вежливый отказ, что и /start.
  it('незнакомец — вежливый отказ, как у /start, а не тишина', async () => {
    await settingsService.update({ schoolSiteUrl: 'https://xuanxue.su' });
    const { ctx, replies } = fakeCtx(999);

    await handler.showMenu(ctx, NOW);

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain('Сюань-Сюэ');
    expect(replies[0]?.text).toContain('https://xuanxue.su');
    expect(replies[0]?.buttons).toBeUndefined();
  });

  it('заблокированный — ACCESS_MESSAGE, без кнопок', async () => {
    await userModel.create({
      name: 'Игорь',
      telegramId: 321,
      roles: [],
      status: 'blocked',
    });
    const { ctx, replies } = fakeCtx(321);

    await handler.showMenu(ctx, NOW);

    expect(replies).toEqual([{ text: ACCESS_MESSAGE, buttons: undefined }]);
  });

  it('группа, а не личный чат — тоже молчит', async () => {
    await seedTeacher(userModel, channelModel, 111);
    const { ctx, replies } = fakeCtx(111, 'group');

    await handler.showMenu(ctx, NOW);

    expect(replies).toHaveLength(0);
  });

  it('ученик — по /menu получает узкое меню, одна кнопка «Экзамены»', async () => {
    await userModel.create({ name: 'Ваня', telegramId: 701, roles: [] });
    const { ctx, replies } = fakeCtx(701);

    await handler.showMenu(ctx, NOW);

    expect(replies[0]?.buttons).toEqual([
      [{ text: 'Экзамены', callback_data: 'menu:exams' }],
    ]);
  });

  it('ученик — по /help текст без /topic и со ссылкой на /exams', async () => {
    await userModel.create({ name: 'Ваня', telegramId: 702, roles: [] });
    const { ctx, replies } = fakeCtx(702);

    await handler.showHelp(ctx, NOW);

    expect(replies[0]?.text).not.toContain('/topic');
    expect(replies[0]?.text).toContain('/exams');
  });

  it('ученик — по /schedule получает своё меню, а не занятия школы', async () => {
    await userModel.create({ name: 'Ваня', telegramId: 703, roles: [] });
    await seedLesson('2026-09-08T16:00:00Z');
    const { ctx, replies } = fakeCtx(703);

    await handler.showSchedule(ctx, NOW);

    expect(replies[0]?.text).not.toContain('zoom.us');
    expect(replies[0]?.buttons).toEqual([
      [{ text: 'Экзамены', callback_data: 'menu:exams' }],
    ]);
  });

  it('«Ближайшие занятия» показывает ближайшее занятие со ссылкой', async () => {
    await seedTeacher(userModel, channelModel, 111);
    await seedLesson('2026-09-08T16:00:00Z');
    const { ctx, replies } = fakeCtx(111);

    await handler.showSchedule(ctx, NOW);

    expect(replies[0]?.text).toContain('Цигун для глаз');
    expect(replies[0]?.text).toContain('https://zoom.us/j/1');
  });

  it('занятий впереди нет — честная фраза, а не пустое сообщение', async () => {
    await seedTeacher(userModel, channelModel, 111);
    await seedLesson('2026-09-01T16:00:00Z');
    const { ctx, replies } = fakeCtx(111);

    await handler.showSchedule(ctx, NOW);

    expect(replies[0]?.text).toBe('Ближайших занятий нет.');
  });

  it('/help перечисляет команды и оставляет кнопки меню', async () => {
    await seedTeacher(userModel, channelModel, 111);
    const { ctx, replies } = fakeCtx(111);

    await handler.showHelp(ctx, NOW);

    expect(replies[0]?.text).toContain('/schedule');
    expect(replies[0]?.buttons).toHaveLength(5);
  });

  it('база упала на середине — бот молчит, ошибка уходит в лог, апдейт не падает', async () => {
    await seedTeacher(userModel, channelModel, 111);
    const broken = new MenuCommandHandler(
      buildPersonalChats(connection, new UsersService(userModel), channelModel),
      {
        list: () => Promise.reject(new Error('Mongo недоступна')),
      } as unknown as MyLessonsService,
      new BotUserAccessService(new UsersService(userModel)),
      settingsService,
    );
    const { ctx, replies } = fakeCtx(111);

    await expect(broken.showSchedule(ctx, NOW)).resolves.toBeUndefined();

    expect(replies).toHaveLength(0);
  });

  it('человек заблокировал бота — меню не доставилось, апдейт не упал', async () => {
    await seedTeacher(userModel, channelModel, 111);
    const { ctx, replies } = fakeCtx(111, 'private', true);

    await expect(handler.showMenu(ctx, NOW)).resolves.toBeUndefined();

    expect(replies).toHaveLength(0);
  });
});
