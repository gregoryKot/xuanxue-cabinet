// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// findByTelegramId и upsertTelegramChat читают/пишут по-настоящему. ctx —
// фейковый объект с `.from`, `.reply` и `.startPayload` (маршрутизацию
// Telegraf проверяет telegram-bot.service.spec.ts). SettingsService —
// настоящий (LessonModel/ClassModel этой же memory-Mongo), чтобы
// schoolSiteUrl шёл по реальному сервису, не фейку с одним методом.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { ConfigService } from '@nestjs/config';
import type { Context } from 'telegraf';
import {
  ACCESS_MESSAGE,
  INVITE_LINK_INVALID_MESSAGE,
  PENDING_APPROVAL_MESSAGE,
} from '@xuanxue/shared';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { LessonRecord, LessonSchema } from '../../lessons/lesson.schema';
import { SettingsRecord, SettingsSchema } from '../../settings/settings.schema';
import { SettingsService } from '../../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import type { InviteLinkService } from '../../users/invite-link.service';
import { JoinByInviteService } from '../../users/join-by-invite.service';
import type { TelegramLinkService } from '../../users/telegram-link.service';
import { UserRolesService } from '../../users/user-roles.service';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { StartHandler } from './start.handler';

const VALID_INVITE_CODE = 'a'.repeat(32);
function fakeInviteLinkService(): InviteLinkService {
  return {
    isValid: (code: string) => Promise.resolve(code === VALID_INVITE_CODE),
  } as unknown as InviteLinkService;
}
function fakeConfigWithPublicUrl(): ConfigService {
  return { get: () => 'https://xuanxue.su' } as unknown as ConfigService;
}
// Ветка link_<code> живёт своим тестом (telegram-link-deep-link.spec.ts) —
// здесь фейк нужен только для конструктора, вызывать его некому: ни один
// текущий сценарий не шлёт payload link_<код>.
function fakeTelegramLinkService(): TelegramLinkService {
  return {
    linkByCode: () => Promise.reject(new Error('linkByCode не должен был вызываться')),
  } as unknown as TelegramLinkService;
}

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

function fakeCtx(
  telegramId: number | undefined,
  chatType: 'private' | 'group' = 'private',
  failSecondReply = false,
  startPayload?: string,
  firstName = 'Тест',
): {
  ctx: Context;
  replies: string[];
} {
  const replies: string[] = [];
  const ctx = {
    chat: { type: chatType },
    from:
      telegramId === undefined ? undefined : { id: telegramId, first_name: firstName },
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
      new UsersService(userModel),
      new JoinByInviteService(
        fakeInviteLinkService(),
        new UserRolesService(userModel, new UsersService(userModel)),
        new UsersService(userModel),
      ),
      fakeInviteLinkService(),
      fakeTelegramLinkService(),
      fakeConfigWithPublicUrl(),
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
      new UsersService(userModel),
      new JoinByInviteService(
        fakeInviteLinkService(),
        new UserRolesService(userModel, new UsersService(userModel)),
        new UsersService(userModel),
      ),
      fakeInviteLinkService(),
      fakeTelegramLinkService(),
      fakeConfigWithPublicUrl(),
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
    // Регрессия инцидента 2026-09-16 (RUNBOOK §8.17): ученик вошёл в кабинет
    // по почте (нет telegramId в users), сдал экзамен, нажал «Отправить видео
    // боту» — раньше бот всё равно заводил ожидание видео и узнавал правду
    // только после присылки ролика («не нашли попытку»). Видео привязывается
    // только владельцу попытки с привязанным Telegram (ADR-0023, это правило
    // не меняем) — незнакомцу отказ приходит сразу, до ожидания.
    it('/start exam_<attemptId>, анонимный отправитель (нет аккаунта) — НЕ заводит ожидание, отвечает про непривязанный Telegram', async () => {
      const attemptId = new Types.ObjectId().toString();
      const { ctx, replies } = fakeCtx(444, 'private', false, `exam_${attemptId}`);

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([
        'Этот Telegram не связан с вашим кабинетом, поэтому видео сюда не примем. ' +
          'Вернитесь в кабинет и вставьте ссылку на видео на экране попытки.',
      ]);
      expect(await botSessionModel.countDocuments({ chatId: 444 })).toBe(0);
      // Не создаёт канал — обычный отказ, не подключение.
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

  // Ссылка-приглашение школы через бота (ADR-0030 «Бот») — тот же код, что
  // и на сайте (/join/<code>), JoinByInviteService.join() общий с вебом.
  // Баг с #131 (найден 2026-09-16): join() заводил active, но личный
  // чат не регистрировался в channels — read-after-write ниже теперь
  // проверяет и channelModel, не только userModel.
  describe('deep link «Ссылка-приглашение» (join_<code>, ADR-0030)', () => {
    it('invited + верный код — active, личный канал зарегистрирован (регрессия 2026-09-16), меню', async () => {
      await userModel.create({
        name: 'Ждёт подтверждения',
        telegramId: 601,
        roles: [],
        status: 'invited',
      });
      const { ctx, replies } = fakeCtx(
        601,
        'private',
        false,
        `join_${VALID_INVITE_CODE}`,
      );

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([
        'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
        expect.stringContaining('Экзамены можно сдать'),
      ]);
      const after = await userModel.findOne({ telegramId: 601 }).lean();
      expect(after?.status).toBe('active');
      expect(after?.joinedViaInviteAt).toBeInstanceOf(Date);
      const channel = await channelModel
        .findOne({ type: 'telegram', target: '601' })
        .lean();
      expect(channel?.active).toBe(true);
      expect(channel?.broadcastEligible).toBe(false);
      expect(channel?.title).toBe('Личные сообщения: Ждёт подтверждения');
    });

    it('неверный код — INVITE_LINK_INVALID_MESSAGE, статус не меняется, канал не создан', async () => {
      await userModel.create({
        name: 'Ждёт подтверждения',
        telegramId: 602,
        roles: [],
        status: 'invited',
      });
      const { ctx, replies } = fakeCtx(602, 'private', false, 'join_' + '0'.repeat(32));

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
      expect((await userModel.findOne({ telegramId: 602 }).lean())?.status).toBe(
        'invited',
      );
      expect(await channelModel.countDocuments({})).toBe(0);
    });

    it('заблокированный — ACCESS_MESSAGE даже с верным кодом, статус не меняется, канал не создан', async () => {
      await userModel.create({
        name: 'Заблокирован',
        telegramId: 603,
        roles: [],
        status: 'blocked',
      });
      const { ctx, replies } = fakeCtx(
        603,
        'private',
        false,
        `join_${VALID_INVITE_CODE}`,
      );

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([ACCESS_MESSAGE]);
      expect((await userModel.findOne({ telegramId: 603 }).lean())?.status).toBe(
        'blocked',
      );
      expect(await channelModel.countDocuments({})).toBe(0);
    });

    it('незнакомец + верный код — создаётся invited из Telegram-идентичности, сразу active и личный канал (регрессия 2026-09-16)', async () => {
      const { ctx, replies } = fakeCtx(
        604,
        'private',
        false,
        `join_${VALID_INVITE_CODE}`,
        'Аня',
      );

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([
        'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
        expect.stringContaining('Экзамены можно сдать'),
      ]);
      const created = await userModel.findOne({ telegramId: 604 }).lean();
      expect(created?.status).toBe('active');
      expect(created?.name).toBe('Аня');
      expect(created?.roles).toEqual([]);
      expect(created?.joinedViaInviteAt).toBeInstanceOf(Date);
      const channel = await channelModel
        .findOne({ type: 'telegram', target: '604' })
        .lean();
      expect(channel?.active).toBe(true);
      expect(channel?.broadcastEligible).toBe(false);
      expect(channel?.title).toBe('Личные сообщения: Аня');
    });

    it('незнакомец + неверный код — INVITE_LINK_INVALID_MESSAGE, аккаунт не создаётся, канал не создан', async () => {
      const { ctx, replies } = fakeCtx(606, 'private', false, 'join_' + '0'.repeat(32));

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
      expect(await userModel.countDocuments({ telegramId: 606 })).toBe(0);
      expect(await channelModel.countDocuments({})).toBe(0);
    });

    it('active повторно — 200-эквивалент без ошибки, статус не меняется, канал зарегистрирован идемпотентно', async () => {
      await userModel.create({
        name: 'Уже в кабинете',
        telegramId: 605,
        roles: [],
        status: 'active',
      });
      const { ctx, replies } = fakeCtx(
        605,
        'private',
        false,
        `join_${VALID_INVITE_CODE}`,
      );

      await handler.handle(ctx, NOW);

      // Повторный /start того же человека тоже даёт два сообщения (успех +
      // меню) — идемпотентно, тот же приём, что и обычный /start.
      expect(replies).toEqual([
        'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
        expect.stringContaining('Экзамены можно сдать'),
      ]);
      const channel = await channelModel
        .findOne({ type: 'telegram', target: '605' })
        .lean();
      expect(channel?.active).toBe(true);
    });

    // Баг с #131 (найден 2026-09-16): наивный фикс мог бы звать
    // upsertTelegramChat вместо upsertPersonalTelegramChat и подключить
    // личный чат ученика ко всем активным классам (ADR-0027) — этого не
    // происходит, тот же образец, что у обычного /start выше.
    it('ученик по ссылке НЕ подключается к активным классам (ADR-0027)', async () => {
      const active = await classModel.create({
        title: 'Тайцзицюань',
        format: 'online',
        active: true,
      });

      const { ctx } = fakeCtx(607, 'private', false, `join_${VALID_INVITE_CODE}`, 'Аня');
      await handler.handle(ctx, NOW);

      const classAfter = await classModel.findById(active._id).lean();
      expect(classAfter?.channelIds).toHaveLength(0);
    });
  });
});
