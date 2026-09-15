// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// findByTelegramId и upsertTelegramChat читают/пишут по-настоящему. ctx —
// фейковый объект с `.from`, `.reply` и `.startPayload` (маршрутизацию
// Telegraf проверяет telegram-bot.service.spec.ts). SettingsService —
// настоящий (LessonModel/ClassModel этой же memory-Mongo), чтобы
// schoolSiteUrl шёл по реальному сервису, не фейку с одним методом.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { ACCESS_MESSAGE, PENDING_APPROVAL_MESSAGE } from '@xuanxue/shared';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { LessonRecord, LessonSchema } from '../../lessons/lesson.schema';
import { SettingsRecord, SettingsSchema } from '../../settings/settings.schema';
import { SettingsService } from '../../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { StartHandler } from './start.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

function fakeCtx(
  telegramId: number | undefined,
  chatType: 'private' | 'group' = 'private',
  failSecondReply = false,
  startPayload?: string,
): {
  ctx: Context;
  replies: string[];
} {
  const replies: string[] = [];
  const ctx = {
    chat: { type: chatType },
    from: telegramId === undefined ? undefined : { id: telegramId },
    message: { text: startPayload ? `/start ${startPayload}` : '/start' },
    reply: (text: string) => {
      // Второе сообщение — меню: человек мог заблокировать бота между двумя
      // ответами, и это не повод падать.
      if (failSecondReply && replies.length === 1) {
        return Promise.reject(new Error('бот заблокирован'));
      }
      replies.push(text);
      return Promise.resolve();
    },
  } as unknown as Context;
  return { ctx, replies };
}

describe('StartHandler', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let settingsModel: Model<SettingsRecord>;
  let botSessionModel: Model<BotSessionRecord>;
  let settingsService: SettingsService;
  let handler: StartHandler;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    settingsModel = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    botSessionModel = connection.model<BotSessionRecord>(
      BotSessionRecord.name,
      BotSessionSchema,
    );
    await channelModel.syncIndexes();
    settingsService = new SettingsService(
      settingsModel,
      lessonModel,
      classModel,
      new UsersService(userModel),
    );
    handler = new StartHandler(
      settingsService,
      new ChannelConfigService(channelModel, classModel),
      new BotSessionService(botSessionModel),
      new BotUserAccessService(new UsersService(userModel)),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
    await classModel.deleteMany({});
    await settingsModel.deleteMany({});
    await botSessionModel.deleteMany({});
  });

  it('учитель — личный чат становится каналом, ответ с текстом подключения и меню', async () => {
    const teacher = await userModel.create({
      name: 'Мария',
      telegramId: 111,
      roles: ['teacher'],
    });

    const { ctx, replies } = fakeCtx(111);
    await handler.handle(ctx, NOW);

    const channel = await channelModel.findOne({ target: '111' }).lean();
    expect(channel?.active).toBe(true);
    expect(channel?.title).toBe(`Личные сообщения: ${teacher.name}`);
    // Два сообщения: «вы подключены» и следом меню кнопками — раньше /start
    // заканчивался первым и человек не видел, что бот ещё что-то умеет.
    expect(replies).toHaveLength(2);
    expect(replies[0]).toContain('Вы подключены');
    expect(replies[1]).toContain('/topic');
  });

  it('админ — тоже получает личный канал', async () => {
    await userModel.create({ name: 'Дима', telegramId: 222, roles: ['admin'] });

    const { ctx } = fakeCtx(222);
    await handler.handle(ctx, NOW);

    expect(await channelModel.countDocuments({ target: '222' })).toBe(1);
  });

  it('чужой Telegram ID — отказ со ссылкой на сайт школы, канал не создан', async () => {
    await settingsService.update({ schoolSiteUrl: 'https://xuanxue.su' });

    const { ctx, replies } = fakeCtx(999);
    await handler.handle(ctx, NOW);

    expect(await channelModel.countDocuments({})).toBe(0);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('https://xuanxue.su');
    expect(replies[0]).not.toContain('Вы подключены');
  });

  it('ученик (active, без ролей учителя) — подключается, личный канал не рассылочный (ADR-0027)', async () => {
    const student = await userModel.create({ name: 'Ольга', telegramId: 333, roles: [] });

    const { ctx, replies } = fakeCtx(333);
    await handler.handle(ctx, NOW);

    const channel = await channelModel.findOne({ target: '333' }).lean();
    expect(channel?.active).toBe(true);
    expect(channel?.title).toBe(`Личные сообщения: ${student.name}`);
    // Личный канал ученика — не канал школы: рассылки занятий, экран
    // «Каналы» и подписка нового занятия видят только broadcastEligible
    // !== false (channel-config.service.spec.ts, channels.service.spec.ts,
    // classes.service.spec.ts).
    expect(channel?.broadcastEligible).toBe(false);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('Экзамены можно сдать');
    expect(replies[0]).not.toContain('Этот бот для учителя');
  });

  it('ученик — /start НЕ подключает его ко всем активным классам (в отличие от штата)', async () => {
    const active = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      active: true,
    });
    await userModel.create({ name: 'Ольга', telegramId: 333, roles: [] });

    const { ctx } = fakeCtx(333);
    await handler.handle(ctx, NOW);

    const classAfter = await classModel.findById(active._id).lean();
    expect(classAfter?.channelIds).toHaveLength(0);
  });

  it('заблокированный штат — ACCESS_MESSAGE, без канала', async () => {
    await userModel.create({
      name: 'Мария',
      telegramId: 551,
      roles: ['teacher'],
      status: 'blocked',
    });

    const { ctx, replies } = fakeCtx(551);
    await handler.handle(ctx, NOW);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('неподтверждённый (invited) ученик — PENDING_APPROVAL_MESSAGE, без канала', async () => {
    await userModel.create({
      name: 'Ольга',
      telegramId: 552,
      roles: [],
      status: 'invited',
    });

    const { ctx, replies } = fakeCtx(552);
    await handler.handle(ctx, NOW);

    expect(replies).toEqual([PENDING_APPROVAL_MESSAGE]);
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('заблокированный ученик — ACCESS_MESSAGE, без канала', async () => {
    await userModel.create({
      name: 'Ольга',
      telegramId: 553,
      roles: [],
      status: 'blocked',
    });

    const { ctx, replies } = fakeCtx(553);
    await handler.handle(ctx, NOW);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('апдейт без from — ничего не делает, не падает', async () => {
    const { ctx, replies } = fakeCtx(undefined);
    await expect(handler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toHaveLength(0);
  });

  it('/start из группы — игнорируется, без ответа и без канала', async () => {
    const { ctx, replies } = fakeCtx(111, 'group');

    await handler.handle(ctx, NOW);

    expect(replies).toHaveLength(0);
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('schoolSiteUrl не задан (учитель ещё не заполнил экран «Шаблоны») — отказ без падения, без «на сайте …»', async () => {
    const { ctx, replies } = fakeCtx(888);

    await handler.handle(ctx, NOW);

    expect(replies[0]).toBe('Этот бот для учителя школы Сюань-Сюэ.');
    expect(replies[0]).not.toContain('на сайте');
  });

  it('ошибка UsersService (внутри BotUserAccessService) — логируется, не выбрасывается, ответа нет', async () => {
    const failingUsers = {
      findByTelegramId: jest.fn().mockRejectedValue(new Error('mongo down')),
    } as unknown as UsersService;
    const failingHandler = new StartHandler(
      settingsService,
      new ChannelConfigService(channelModel, classModel),
      new BotSessionService(botSessionModel),
      new BotUserAccessService(failingUsers),
    );
    const { ctx, replies } = fakeCtx(777);

    await expect(failingHandler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toHaveLength(0);
  });

  it('меню не доставилось (бота заблокировали) — /start всё равно отработал', async () => {
    const teacher = await userModel.create({
      name: 'Мария',
      telegramId: 111,
      roles: ['teacher'],
    });
    const { ctx, replies } = fakeCtx(111, 'private', true);

    await expect(handler.handle(ctx, NOW)).resolves.toBeUndefined();

    expect(replies).toHaveLength(1);
    const channel = await channelModel.findOne({ target: '111' }).lean();
    expect(channel?.title).toBe(`Личные сообщения: ${teacher.name}`);
  });

  describe('deep link «Отправить видео» (exam_<attemptId>, ADR-0023)', () => {
    it('/start exam_<attemptId>, анонимный отправитель (нет аккаунта) — заводит ожидание', async () => {
      const attemptId = new Types.ObjectId().toString();
      const { ctx, replies } = fakeCtx(444, 'private', false, `exam_${attemptId}`);

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([
        'Снимите или пришлите видео прямо сюда — обычным сообщением, «кружком» ' +
          'или файлом. Как только дойдёт, учитель сможет его посмотреть.',
      ]);
      const session = await botSessionModel.findOne({ chatId: 444 }).lean();
      expect(session?.kind).toBe('examMedia');
      expect(session?.attemptId?.toString()).toBe(attemptId);
      // Не создаёт канал — работает и для ученика без личного канала.
      expect(await channelModel.countDocuments({})).toBe(0);
    });

    it('заблокированный — отказ тем же текстом, что в вебе, ожидание не заводится', async () => {
      const attemptId = new Types.ObjectId().toString();
      await userModel.create({ name: 'Ученик', telegramId: 447, status: 'blocked' });
      const { ctx, replies } = fakeCtx(447, 'private', false, `exam_${attemptId}`);

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([ACCESS_MESSAGE]);
      expect(await botSessionModel.countDocuments({ chatId: 447 })).toBe(0);
    });

    it('неподтверждённый (invited) — отказ ожиданием подтверждения, ожидание не заводится', async () => {
      const attemptId = new Types.ObjectId().toString();
      await userModel.create({ name: 'Ученик', telegramId: 448, status: 'invited' });
      const { ctx, replies } = fakeCtx(448, 'private', false, `exam_${attemptId}`);

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([PENDING_APPROVAL_MESSAGE]);
      expect(await botSessionModel.countDocuments({ chatId: 448 })).toBe(0);
    });

    it('чужой/несуществующий attemptId в ссылке — тот же ответ, ничего не подтверждает', async () => {
      const attemptId = new Types.ObjectId().toString();
      await userModel.create({ name: 'Ученик Б', telegramId: 445, roles: [] });
      const { ctx, replies } = fakeCtx(445, 'private', false, `exam_${attemptId}`);

      await handler.handle(ctx, NOW);

      expect(replies).toHaveLength(1);
      expect(replies[0]).toContain('Снимите или пришлите видео');
    });

    it('битый payload (не 24 hex-символа) — обычный /start, ученик подключается, без ожидания видео', async () => {
      await userModel.create({ name: 'Ученик', telegramId: 446, roles: [] });
      const { ctx, replies } = fakeCtx(446, 'private', false, 'exam_not-an-id');

      await handler.handle(ctx, NOW);

      expect(replies[0]).toContain('Экзамены можно сдать');
      expect(await channelModel.countDocuments({ target: '446' })).toBe(1);
      expect(await botSessionModel.countDocuments({})).toBe(0);
    });
  });
});
