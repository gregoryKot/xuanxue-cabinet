// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): индексы,
// идемпотентность, шифрование текста рассылки, выборка активных каналов
// читаются по-настоящему. Расширенное окно предпросмотра и read-after-write
// с DeliveryRunnerService — broadcast-planner.window.spec.ts (файл-лимит
// спеков, CLAUDE.md «Файлы»).
import mongoose from 'mongoose';
import { decrypt } from '../utils/encryption';
import { SettingsRecord } from '../settings/settings.schema';
import { classifyCancelReason } from './broadcast-cancel-reasons';
import {
  clearPlannerTest,
  createChannel,
  createClass,
  createLesson,
  NOW,
  setupPlannerTest,
  type PlannerTestContext,
} from './broadcast-planner.service.test-support';

describe('BroadcastPlannerService.plan', () => {
  let ctx: PlannerTestContext;

  beforeAll(async () => {
    ctx = await setupPlannerTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearPlannerTest(ctx);
  });

  it('создаёт рассылку и доставки для занятия в окне, текст зашифрован', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
    const broadcasts = await ctx.broadcastModel.find({ lessonId: lesson._id }).lean();
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.status).toBe('scheduled');
    expect(broadcasts[0]?.text).not.toContain('https://zoom.example/1'); // зашифровано
    expect(decrypt(broadcasts[0]?.text)).toContain('https://zoom.example/1');

    const deliveries = await ctx.deliveryModel
      .find({ broadcastId: broadcasts[0]?._id })
      .lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('pending');
    expect(deliveries[0]?.channelId.toString()).toBe(cls.channelIds[0]?.toString());
  });

  it('broadcast есть, а доставок нет (первый тик упал между insert-ами) — второй тик их досоздаёт', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());
    // Симулируем «первый тик успел создать только broadcast»: insert напрямую,
    // без deliveries — insertBroadcastWithDeliveries на дубле должен найти
    // этот документ и достроить недостающие доставки, а не пропустить их.
    await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: cls.channelIds,
      scheduledAt: NOW.toJSDate(),
      text: 'x',
      status: 'scheduled',
    });
    await expect(ctx.deliveryModel.countDocuments({})).resolves.toBe(0);

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 }); // broadcast не новый — счётчик не растёт
    await expect(
      ctx.broadcastModel.countDocuments({ lessonId: lesson._id }),
    ).resolves.toBe(1);
    await expect(ctx.deliveryModel.countDocuments({})).resolves.toBe(1);
  });

  it('второй тик не создаёт вторую рассылку и вторые доставки', async () => {
    const cls = await createClass(ctx);
    await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    await ctx.service.plan(NOW);
    const second = await ctx.service.plan(NOW.plus({ minutes: 1 }));

    expect(second).toEqual({ broadcasts: 0 });
    await expect(ctx.broadcastModel.countDocuments({})).resolves.toBe(1);
    await expect(ctx.deliveryModel.countDocuments({})).resolves.toBe(1);
  });

  it('выключенный класс — cancelled-плейсхолдер с причиной, без доставок', async () => {
    const cls = await createClass(ctx, { active: false });
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    const broadcast = await ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(decrypt(broadcast?.text)).toBe('класс выключен');
    await expect(ctx.deliveryModel.countDocuments({})).resolves.toBe(0);
  });

  it('занятие без класса в базе — cancelled-плейсхолдер', async () => {
    const lesson = await createLesson(
      ctx,
      new mongoose.Types.ObjectId(),
      NOW.plus({ minutes: 10 }).toJSDate(),
    );

    await ctx.service.plan(NOW);

    const broadcast = await ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(decrypt(broadcast?.text)).toBe('занятие без класса в базе');
  });

  it('все каналы класса выключены — cancelled-плейсхолдер, доставок нет', async () => {
    const offChannel = await createChannel(ctx, { active: false });
    const cls = await createClass(ctx, { channelIds: [offChannel._id] });
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    const broadcast = await ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(decrypt(broadcast?.text)).toBe('все каналы класса выключены');
    await expect(ctx.deliveryModel.countDocuments({})).resolves.toBe(0);
  });

  it('часть каналов класса выключена — доставка только на активные', async () => {
    const active = await createChannel(ctx);
    const off = await createChannel(ctx, { active: false });
    const cls = await createClass(ctx, { channelIds: [active._id, off._id] });
    await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
    const deliveries = await ctx.deliveryModel.find({}).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.channelId.toString()).toBe(active._id.toString());
  });

  it('владелец: два канала по тегам («новички»/«средние») — дата уходит только в свой (ADR-0106)', async () => {
    const noviceChannel = await createChannel(ctx, { tags: ['новички'] });
    const intermediateChannel = await createChannel(ctx, { tags: ['средние'] });
    const cls = await createClass(ctx, {
      channelIds: [noviceChannel._id, intermediateChannel._id],
    });
    await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate(), {
      tags: ['новички'],
    });

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
    const deliveries = await ctx.deliveryModel.find({}).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.channelId.toString()).toBe(noviceChannel._id.toString());
  });

  it('канал без тегов получает всё — и дату с тегом, и дату без тега', async () => {
    const openChannel = await createChannel(ctx);
    const cls = await createClass(ctx, { channelIds: [openChannel._id] });
    await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate(), {
      tags: ['новички'],
    });

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
    const deliveries = await ctx.deliveryModel.find({}).lean();
    expect(deliveries[0]?.channelId.toString()).toBe(openChannel._id.toString());
  });

  it('тег занятия в расписании (не свой тег даты) тоже совпадает (ADR-0072)', async () => {
    const noviceChannel = await createChannel(ctx, { tags: ['новички'] });
    const cls = await createClass(ctx, {
      channelIds: [noviceChannel._id],
      tags: ['новички'],
    });
    await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
  });

  it('ни один канал не подписан на тег даты — cancelled-плейсхолдер с новой причиной, DM-действие есть', async () => {
    const intermediateChannel = await createChannel(ctx, { tags: ['средние'] });
    const cls = await createClass(ctx, { channelIds: [intermediateChannel._id] });
    const lesson = await createLesson(
      ctx,
      cls._id,
      NOW.plus({ minutes: 10 }).toJSDate(),
      {
        tags: ['новички'],
      },
    );

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    const broadcast = await ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(decrypt(broadcast?.text)).toBe('ни один канал не подписан на теги занятия');
    expect(classifyCancelReason(decrypt(broadcast?.text) ?? '')).toBe(
      'no_channels_for_tags',
    );
    await expect(ctx.deliveryModel.countDocuments({})).resolves.toBe(0);
  });

  it('у даты и у занятия в расписании совсем нет поля tags (запись до ADR-0075/0072) — не падает, уходит как без тегов', async () => {
    const openChannel = await createChannel(ctx);
    const cls = await createClass(ctx, { channelIds: [openChannel._id] });
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());
    // default: [] подставляет Mongoose только при создании — симулируем
    // документы, заведённые до появления поля tags: в базе его нет вовсе.
    await ctx.classModel.collection.updateOne({ _id: cls._id }, { $unset: { tags: '' } });
    await ctx.lessonModel.collection.updateOne(
      { _id: lesson._id },
      { $unset: { tags: '' } },
    );

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
  });

  it('занятие ещё не в окне — ничего не создаётся', async () => {
    const cls = await createClass(ctx);
    await createLesson(ctx, cls._id, NOW.plus({ hours: 3 }).toJSDate());

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    await expect(ctx.broadcastModel.countDocuments({})).resolves.toBe(0);
  });

  it('занятие началось больше получаса назад — cancelled-плейсхолдер, не broadcast', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(
      ctx,
      cls._id,
      NOW.minus({ minutes: 40 }).toJSDate(),
    );

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    const broadcast = await ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(decrypt(broadcast?.text)).toBe(
      'тик опоздал: занятие началось больше 30 минут назад',
    );
    await expect(ctx.deliveryModel.countDocuments({})).resolves.toBe(0);
  });

  it('занятие началось больше получаса назад — второй тик молчит, второй документ не создаёт', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(
      ctx,
      cls._id,
      NOW.minus({ minutes: 40 }).toJSDate(),
    );

    await ctx.service.plan(NOW);
    const second = await ctx.service.plan(NOW.plus({ minutes: 1 }));

    expect(second).toEqual({ broadcasts: 0 });
    await expect(
      ctx.broadcastModel.countDocuments({ lessonId: lesson._id }),
    ).resolves.toBe(1);
  });

  it('тик опоздал на несколько минут — досылает', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(ctx, cls._id, NOW.minus({ minutes: 5 }).toJSDate());

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
    await expect(
      ctx.broadcastModel.countDocuments({ lessonId: lesson._id }),
    ).resolves.toBe(1);
  });

  it('{ведущий} — имя занятия приоритетнее имени класса, резолвится через UsersService', async () => {
    const lessonLeader = await ctx.userModel.create({
      name: 'Мария',
      roles: ['teacher'],
    });
    const classLeader = await ctx.userModel.create({
      name: 'Дмитрий',
      roles: ['teacher'],
    });
    const cls = await createClass(ctx, { leaderId: classLeader._id });
    await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate(), {
      leaderId: lessonLeader._id,
    });
    await ctx.connection.model(SettingsRecord.name).create({
      _id: 'school',
      templates: { lessonLink: 'ведёт {ведущий}', recording: 'запись' },
      tz: 'Asia/Jerusalem',
    });

    await ctx.service.plan(NOW);

    const broadcast = await ctx.broadcastModel.findOne({}).lean();
    expect(decrypt(broadcast?.text)).toBe('ведёт Мария');
  });
});
