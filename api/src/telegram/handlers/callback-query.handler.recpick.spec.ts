// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кнопки
// «К какому занятию?» (recpick) и «Записи не будет» (norec) при нескольких
// ждущих занятиях (ADR-0175). Один вопрос «Запись?» — callback-query.handler.norec-sent.spec.ts.
import { Types, type Model } from 'mongoose';
import { ClassRecord, CLASS_ENCRYPT_SCHEMA } from '../../classes/class.schema';
import { LessonRecord } from '../../lessons/lesson.schema';
import { encryptRecord } from '../../utils/encryption';
import {
  clearCallbackHandlerTest,
  NOW,
  seedTeacher,
  setupCallbackHandlerTest,
  type CallbackHandlerTestContext,
} from './callback-query.handler.test-support';
import { fakeCtx } from './callback-query.handler.fake-ctx';

const PICK_LOST = 'Не нашёл присланную запись — пришлите ссылку или видео ещё раз.';

describe('CallbackQueryHandler — recpick/norec при нескольких ждущих занятиях', () => {
  let ctx: CallbackHandlerTestContext;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;

  beforeAll(async () => {
    ctx = await setupCallbackHandlerTest();
    lessonModel = ctx.connection.model<LessonRecord>(LessonRecord.name);
    classModel = ctx.connection.model<ClassRecord>(ClassRecord.name);
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearCallbackHandlerTest(ctx);
    await Promise.all([lessonModel.deleteMany({}), classModel.deleteMany({})]);
  });

  /** Занятие, о котором бот спросил «Запись?» час назад (бейдж времени —
   * Asia/Jerusalem, сентябрь UTC+3: +10 мин от NOW — 21:10). */
  async function seedPending(title: string, startsInMinutes: number) {
    const cls = await classModel.create(
      encryptRecord(
        {
          title,
          format: 'online',
          zoomLink: 'https://zoom.example/1',
          tz: 'Asia/Jerusalem',
          leadMinutes: 30,
          active: true,
          channelIds: [],
        },
        CLASS_ENCRYPT_SCHEMA,
      ),
    );
    return lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: startsInMinutes }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
      recordingPromptedAt: NOW.minus({ hours: 1 }).toJSDate(),
    });
  }

  function recordingSession(lessonId: Types.ObjectId, extra: object = {}) {
    return ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId,
      expiresAt: NOW.plus({ hours: 11 }).toJSDate(),
      ...extra,
    });
  }

  it('recpick: ссылка с сессии уходит в выбранное занятие, ожидание — на второе, источник сброшен', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lessonA = await seedPending('цигун для глаз', 10);
    const lessonB = await seedPending('тайцзи', 130);
    await recordingSession(lessonB._id, { recordingUrl: 'https://youtu.be/abc' });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `recpick:${lessonA._id.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    const saved = await lessonModel.findById(lessonA._id).lean();
    expect(saved?.recordings.map((r) => r.url)).toEqual(['https://youtu.be/abc']);
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]).toMatch(/^Запись сохранена к занятию/);
    expect(editCalls[0]).toContain(' Ещё жду запись к ');
    const session = await ctx.botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.kind).toBe('recording');
    expect(session?.lessonId?.toString()).toBe(lessonB._id.toString());
    expect(session?.recordingUrl ?? null).toBeNull();
  });

  it('recpick: на сессии нет источника — просит прислать ещё раз, ничего не сохраняет', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lessonA = await seedPending('цигун для глаз', 10);
    const lessonB = await seedPending('тайцзи', 130);
    await recordingSession(lessonB._id);
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `recpick:${lessonA._id.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual([PICK_LOST]);
    expect(await lessonModel.countDocuments({ 'recordings.0': { $exists: true } })).toBe(
      0,
    );
  });

  it('norec: отметка на занятии, второе ещё ждёт — ожидание чата переходит на него', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lessonA = await seedPending('цигун для глаз', 10);
    const lessonB = await seedPending('тайцзи', 130);
    await recordingSession(lessonA._id);
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `norec:${lessonA._id.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Хорошо, записи не будет.']);
    const declined = await lessonModel.findById(lessonA._id).lean();
    expect(declined?.recordingDeclinedAt?.toISOString()).toBe(NOW.toISO());
    const session = await ctx.botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.kind).toBe('recording');
    expect(session?.lessonId?.toString()).toBe(lessonB._id.toString());
  });

  it('norec: больше ждать нечего — сессия удалена', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lessonA = await seedPending('цигун для глаз', 10);
    await recordingSession(lessonA._id);
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `norec:${lessonA._id.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Хорошо, записи не будет.']);
    const declined = await lessonModel.findById(lessonA._id).lean();
    expect(declined?.recordingDeclinedAt).toBeInstanceOf(Date);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });
});
