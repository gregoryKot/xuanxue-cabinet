// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// findByTelegramId и upsertTelegramChat читают/пишут по-настоящему. ctx —
// фейковый объект с `.from`, `.reply` и `.startPayload` (маршрутизацию
// Telegraf проверяет telegram-bot.service.spec.ts). SettingsService —
// настоящий (LessonModel/ClassModel этой же memory-Mongo), чтобы
// schoolSiteUrl шёл по реальному сервису, не фейку с одним методом. Сборка
// харнесса и join_<code> (ADR-0030/0034) — в start.handler.test-support.ts
// и start.handler.join.spec.ts (файловый храповик, CLAUDE.md «Храповики»).
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import { ChannelRecord } from '../../channels/channel.schema';
import { UserRecord } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { StartHandler } from './start.handler';
import {
  buildStartHandler,
  clearStartHandlerHarness,
  fakeCtx,
  openStartHandlerHarness,
  type StartHandlerHarness,
} from './start.handler.test-support';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

describe('StartHandler', () => {
  let harness: StartHandlerHarness;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let handler: StartHandler;

  beforeAll(async () => {
    harness = await openStartHandlerHarness();
    ({ userModel, channelModel, handler } = harness);
  }, 60_000);

  afterAll(async () => {
    await harness.memory.stop();
  });

  afterEach(async () => {
    await clearStartHandlerHarness(harness);
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
    await harness.settingsService.update({ schoolSiteUrl: 'https://xuanxue.su' });

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
    const active = await harness.classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      active: true,
    });
    await userModel.create({ name: 'Ольга', telegramId: 333, roles: [] });

    const { ctx } = fakeCtx(333);
    await handler.handle(ctx, NOW);

    const classAfter = await harness.classModel.findById(active._id).lean();
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
    const failingHandler = buildStartHandler(
      userModel,
      channelModel,
      harness.classModel,
      harness.botSessionModel,
      harness.settingsService,
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
      expect(await harness.botSessionModel.countDocuments({ chatId: 444 })).toBe(0);
      // Не создаёт канал — обычный отказ, не подключение.
      expect(await channelModel.countDocuments({})).toBe(0);
    });

    it('заблокированный — отказ тем же текстом, что в вебе, ожидание не заводится', async () => {
      const attemptId = new Types.ObjectId().toString();
      await userModel.create({ name: 'Ученик', telegramId: 447, status: 'blocked' });
      const { ctx, replies } = fakeCtx(447, 'private', false, `exam_${attemptId}`);

      await handler.handle(ctx, NOW);

      expect(replies).toEqual([ACCESS_MESSAGE]);
      expect(await harness.botSessionModel.countDocuments({ chatId: 447 })).toBe(0);
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
      expect(await harness.botSessionModel.countDocuments({})).toBe(0);
    });
  });
});
