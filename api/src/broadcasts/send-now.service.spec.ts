// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): три ветки по
// статусу существующей lesson_link-рассылки плюс проверки входа (ссылка,
// каналы, отменённое занятие) — образец обвязки, что у
// broadcast-planner.service.spec.ts.
import { ConflictError, InvalidInputError, NotFoundError } from '../common/errors';
import {
  NOW,
  clearSendNowTest,
  createChannel,
  createClass,
  createLesson,
  setupSendNowTest,
  type SendNowTestContext,
} from './send-now.service.test-support';

describe('SendNowService.sendNow', () => {
  let ctx: SendNowTestContext;

  beforeAll(async () => {
    ctx = await setupSendNowTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearSendNowTest(ctx);
  });

  it('занятия нет — NotFoundError', async () => {
    await expect(
      ctx.service.sendNow('507f1f77bcf86cd799439011', NOW),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('занятие отменено — InvalidInputError', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(
      ctx,
      cls._id,
      NOW.plus({ minutes: 10 }).toJSDate(),
      {
        status: 'cancelled',
      },
    );

    await expect(ctx.service.sendNow(lesson._id.toString(), NOW)).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });

  it('у занятия нет ссылки — InvalidInputError с текстом по VOICE.md', async () => {
    const cls = await createClass(ctx, { zoomLink: undefined });
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    await expect(ctx.service.sendNow(lesson._id.toString(), NOW)).rejects.toMatchObject({
      message: expect.stringContaining('нет ссылки') as unknown,
    });
  });

  it('у занятия нет активных каналов — InvalidInputError с текстом по VOICE.md', async () => {
    const offChannel = await createChannel(ctx, { active: false });
    const cls = await createClass(ctx, { channelIds: [offChannel._id] });
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    await expect(ctx.service.sendNow(lesson._id.toString(), NOW)).rejects.toMatchObject({
      message: expect.stringContaining('нет подключённых каналов') as unknown,
    });
  });

  it('канал активен, но не подписан на тег занятия (ADR-0108) — InvalidInputError, другой текст', async () => {
    const channel = await createChannel(ctx, { tags: ['средние'] });
    const cls = await createClass(ctx, { channelIds: [channel._id] });
    const lesson = await createLesson(
      ctx,
      cls._id,
      NOW.plus({ minutes: 10 }).toJSDate(),
      {
        tags: ['новички'],
      },
    );

    await expect(ctx.service.sendNow(lesson._id.toString(), NOW)).rejects.toMatchObject({
      message: expect.stringContaining('не подписан на теги') as unknown,
    });
  });

  it('у даты и у занятия в расписании совсем нет поля tags (запись до ADR-0075/0072) — не падает, ссылка уходит', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 40 }).toJSDate());
    // default: [] подставляет Mongoose только при создании — симулируем
    // документы, заведённые до появления поля tags: в базе его нет вовсе.
    await ctx.classModel.collection.updateOne({ _id: cls._id }, { $unset: { tags: '' } });
    await ctx.lessonModel.collection.updateOne(
      { _id: lesson._id },
      { $unset: { tags: '' } },
    );

    const dto = await ctx.service.sendNow(lesson._id.toString(), NOW);

    expect(dto.status).toBe('scheduled');
  });

  it('рассылки ещё не было — создаёт scheduled-рассылку и доставки на активные каналы', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 40 }).toJSDate());

    const dto = await ctx.service.sendNow(lesson._id.toString(), NOW);

    expect(dto.status).toBe('scheduled');
    expect(dto.kind).toBe('lesson_link');
    expect(new Date(dto.scheduledAt).getTime()).toBeLessThanOrEqual(
      NOW.toJSDate().getTime(),
    );
    const deliveries = await ctx.deliveryModel.find({ broadcastId: dto.id }).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('pending');
    expect(deliveries[0]?.nextAttemptAt?.getTime()).toBeLessThanOrEqual(
      NOW.toJSDate().getTime(),
    );
  });

  it('scheduled, доставка не захвачена — переставляет scheduledAt/nextAttemptAt И подхватывает свежий текст (учитель успел поправить ссылку)', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 40 }).toJSDate());
    const later = NOW.plus({ minutes: 40 });
    await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: cls.channelIds,
      scheduledAt: later.toJSDate(),
      text: 'старая ссылка',
      status: 'scheduled',
    });
    const broadcastBefore = await ctx.broadcastModel
      .findOne({ lessonId: lesson._id })
      .lean();
    await ctx.deliveryModel.create({
      broadcastId: broadcastBefore?._id,
      channelId: cls.channelIds[0],
      status: 'pending',
      nextAttemptAt: later.toJSDate(),
    });

    const dto = await ctx.service.sendNow(lesson._id.toString(), NOW);

    expect(dto.id).toBe(broadcastBefore?._id.toString());
    expect(new Date(dto.scheduledAt).getTime()).toBeLessThan(later.toJSDate().getTime());
    // Ревью п.2: рассылку ещё не забрал раннер — свежий рендер (та же ссылка
    // класса, что и раньше, но текст пересобран заново) заменяет старый.
    expect(dto.text).not.toBe('старая ссылка');
    const delivery = await ctx.deliveryModel.findOne({ broadcastId: dto.id }).lean();
    expect(delivery?.nextAttemptAt?.getTime()).toBeLessThan(later.toJSDate().getTime());
  });

  it('scheduled, доставка уже захвачена раннером (sending) — текст не меняем, ускоряем только оставшиеся pending (ревью п.2/п.6)', async () => {
    const cls = await createClass(ctx, { channelIds: [] });
    const channelA = await createChannel(ctx);
    const channelB = await createChannel(ctx);
    await ctx.classModel.updateOne(
      { _id: cls._id },
      { $set: { channelIds: [channelA._id, channelB._id] } },
    );
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 40 }).toJSDate());
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: [channelA._id, channelB._id],
      scheduledAt: NOW.toJSDate(),
      text: 'старая ссылка',
      status: 'scheduled',
    });
    await ctx.deliveryModel.create([
      {
        broadcastId: broadcast._id,
        channelId: channelA._id,
        status: 'sending',
        lockedAt: NOW.toJSDate(),
      },
      {
        broadcastId: broadcast._id,
        channelId: channelB._id,
        status: 'pending',
        nextAttemptAt: NOW.plus({ hours: 1 }).toJSDate(),
      },
    ]);

    const dto = await ctx.service.sendNow(lesson._id.toString(), NOW);

    // Канал A уже в пути со старым текстом — врать «пересобрано» нельзя.
    expect(dto.text).toBe('старая ссылка');
    const pendingAfter = await ctx.deliveryModel
      .findOne({ broadcastId: broadcast._id, channelId: channelB._id })
      .lean();
    expect(pendingAfter?.nextAttemptAt?.getTime()).toBeLessThanOrEqual(
      NOW.toJSDate().getTime(),
    );
    const sendingAfter = await ctx.deliveryModel
      .findOne({ broadcastId: broadcast._id, channelId: channelA._id })
      .lean();
    expect(sendingAfter?.status).toBe('sending');
  });

  it('канал выключили после провала — его доставка cancelled, у нового канала появляется pending (ревью п.3а)', async () => {
    const droppedChannel = await createChannel(ctx, { active: false });
    const keptChannel = await createChannel(ctx);
    const cls = await createClass(ctx, { channelIds: [keptChannel._id] });
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 40 }).toJSDate());
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: [droppedChannel._id],
      scheduledAt: NOW.toJSDate(),
      text: 'старая ссылка',
      status: 'failed',
    });
    await ctx.deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: droppedChannel._id,
      status: 'failed',
    });

    const dto = await ctx.service.sendNow(lesson._id.toString(), NOW);

    expect(dto.status).toBe('scheduled');
    expect(dto.channelIds).toEqual([keptChannel._id.toString()]);
    await expect(
      ctx.deliveryModel
        .findOne({ broadcastId: broadcast._id, channelId: droppedChannel._id })
        .lean(),
    ).resolves.toMatchObject({ status: 'cancelled' });
    await expect(
      ctx.deliveryModel
        .findOne({ broadcastId: broadcast._id, channelId: keptChannel._id })
        .lean(),
    ).resolves.toMatchObject({ status: 'pending' });
  });

  it('все подключённые каналы уже sent — ConflictError, статус не меняется (ревью п.3б)', async () => {
    const channel = await createChannel(ctx);
    const cls = await createClass(ctx, { channelIds: [channel._id] });
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 40 }).toJSDate());
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: [channel._id],
      scheduledAt: NOW.toJSDate(),
      text: 'x',
      status: 'failed',
    });
    await ctx.deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: channel._id,
      status: 'sent',
    });

    await expect(ctx.service.sendNow(lesson._id.toString(), NOW)).rejects.toMatchObject({
      message: expect.stringContaining('во все подключённые каналы') as unknown,
    });
    await expect(
      ctx.broadcastModel.findById(broadcast._id).lean(),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('cancelled (too_late-плейсхолдер) — оживает в scheduled с доставками на активные каналы', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(
      ctx,
      cls._id,
      NOW.minus({ minutes: 40 }).toJSDate(),
    );
    await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: [], // insertCancelledPlaceholder всегда пустой список
      scheduledAt: NOW.toJSDate(),
      text: 'тик опоздал: занятие началось больше 30 минут назад',
      status: 'cancelled',
    });

    const dto = await ctx.service.sendNow(lesson._id.toString(), NOW);

    expect(dto.status).toBe('scheduled');
    expect(dto.channelIds).toEqual(cls.channelIds.map((id) => id.toString()));
    // dto.text — BroadcastsService.getById уже расшифровал; текст плейсхолдера
    // заменён на свежий рендер поста, «тик опоздал» в нём быть не должно.
    expect(dto.text).not.toContain('тик опоздал');
    expect(dto.text).toContain('zoom.example');
    const deliveries = await ctx.deliveryModel.find({ broadcastId: dto.id }).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('pending');

    // Повтор — тот же документ, не дубль (CLAUDE.md «Идемпотентно»).
    const second = await ctx.service.sendNow(
      lesson._id.toString(),
      NOW.plus({ minutes: 1 }),
    );
    expect(second.id).toBe(dto.id);
    await expect(
      ctx.broadcastModel.countDocuments({ lessonId: lesson._id }),
    ).resolves.toBe(1);
  });

  it('sent — ConflictError, рассылку не трогает', async () => {
    const cls = await createClass(ctx);
    const lesson = await createLesson(ctx, cls._id, NOW.plus({ minutes: 10 }).toJSDate());
    const sentAt = NOW.minus({ minutes: 5 }).toJSDate();
    await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: cls.channelIds,
      scheduledAt: sentAt,
      sentAt,
      text: 'x',
      status: 'sent',
    });

    await expect(ctx.service.sendNow(lesson._id.toString(), NOW)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(
      ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean(),
    ).resolves.toMatchObject({ status: 'sent' });
  });
});
