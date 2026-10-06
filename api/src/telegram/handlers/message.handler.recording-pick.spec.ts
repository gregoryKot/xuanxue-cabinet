// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): запись
// приходит, когда ждут несколько занятий (ADR-0172) — вопрос «К какому занятию?»
// кнопками recpick, ответ (reply) на вопрос бота, хвост «Ещё жду…» и закрытие
// ожидания. Один вопрос «Запись?» — message.handler.recording.spec.ts.
import { Types } from 'mongoose';
import { CLASS_ENCRYPT_SCHEMA } from '../../classes/class.schema';
import { encryptRecord } from '../../utils/encryption';
import { seedTeacher } from '../test-support/seed-teacher';
import { fakeCtx } from './message.handler.fake-ctx';
import { NOW } from './message.handler.seed';
import {
  clearMessageHandlerTest,
  setupMessageHandlerTest,
  type MessageHandlerTestContext,
} from './message.handler.test-support';

const PICK_PROMPT = 'К какому занятию эта запись?';
// Подписи кнопок: время по поясу класса (Asia/Jerusalem, сентябрь — UTC+3).
const LABEL_EYES = '«цигун для глаз · средняя группа» 21:10';
const LABEL_TAIJI = '«тайцзи» 23:10';
const SAVED_PREFIX = 'Запись сохранена к занятию';

describe('MessageHandler — запись при нескольких ожидающих занятиях', () => {
  let ctx: MessageHandlerTestContext;

  beforeAll(async () => {
    ctx = await setupMessageHandlerTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearMessageHandlerTest(ctx);
  });

  /** Занятие, о котором бот спросил «Запись?» час назад. */
  async function seedPending(
    title: string,
    groupLabel: string | undefined,
    startsInMinutes: number,
    extra: Record<string, unknown> = {},
  ) {
    const cls = await ctx.classModel.create(
      encryptRecord(
        {
          title,
          ...(groupLabel ? { groupLabel } : {}),
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
    return ctx.lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: startsInMinutes }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
      recordingPromptedAt: NOW.minus({ hours: 1 }).toJSDate(),
      ...extra,
    });
  }

  async function seedTwoPending() {
    const eyes = await seedPending('цигун для глаз', 'средняя группа', 10);
    const taiji = await seedPending('тайцзи', undefined, 130);
    // Активная сессия — на последнем из вопросов, как после трёх «закончилось» подряд.
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: taiji._id,
      expiresAt: NOW.plus({ hours: 11 }).toJSDate(),
    });
    return { eyes, taiji };
  }

  it('два занятия ждут, пришла ссылка — спрашивает кнопками, источник лежит на сессии', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { eyes, taiji } = await seedTwoPending();
    const {
      ctx: msgCtx,
      replies,
      replyMarkups,
    } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([PICK_PROMPT]);
    expect(replyMarkups[0]).toEqual([
      [{ text: LABEL_EYES, callback_data: `recpick:${eyes._id.toString()}` }],
      [{ text: LABEL_TAIJI, callback_data: `recpick:${taiji._id.toString()}` }],
    ]);
    for (const id of [eyes._id, taiji._id]) {
      expect((await ctx.lessonModel.findById(id).lean())?.recordings).toHaveLength(0);
    }
    const session = await ctx.botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.kind).toBe('recording');
    expect(session?.recordingUrl).toBe('https://youtu.be/abc');
  });

  it('два занятия ждут, пришло видео — file_id лежит на сессии до выбора', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    await seedTwoPending();
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, videoFileId: 'BAACvideo' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([PICK_PROMPT]);
    const session = await ctx.botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.kind).toBe('recording');
    expect(session?.recordingFileId).toBe('BAACvideo');
    expect(session?.recordingUrl ?? null).toBeNull();
  });

  it('ждёт одно занятие, сессия указывает на другое, уже с записью — ссылка уходит в ждущее', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const pending = await seedPending('цигун для глаз', 'средняя группа', 10);
    const withRecording = await seedPending('тайцзи', undefined, 130, {
      recordings: [{ title: 'Запись', url: 'https://youtu.be/old' }],
    });
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: withRecording._id,
      expiresAt: NOW.plus({ hours: 11 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/new',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain(SAVED_PREFIX);
    const saved = await ctx.lessonModel.findById(pending._id).lean();
    expect(saved?.recordings.map((r) => r.url)).toEqual(['https://youtu.be/new']);
    const untouched = await ctx.lessonModel.findById(withRecording._id).lean();
    expect(untouched?.recordings.map((r) => r.url)).toEqual(['https://youtu.be/old']);
  });

  it('ответ на вопрос бота при двух ждущих — запись в то занятие, хвост называет второе, ожидание на нём', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { eyes, taiji } = await seedTwoPending();
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
      replyToNorecLessonId: eyes._id.toString(),
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatch(new RegExp(`^${SAVED_PREFIX}`));
    expect(replies[0]?.endsWith(` Ещё жду запись к ${LABEL_TAIJI}.`)).toBe(true);
    const saved = await ctx.lessonModel.findById(eyes._id).lean();
    expect(saved?.recordings.map((r) => r.url)).toEqual(['https://youtu.be/abc']);
    const session = await ctx.botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.kind).toBe('recording');
    expect(session?.lessonId?.toString()).toBe(taiji._id.toString());
    expect(session?.recordingUrl ?? null).toBeNull();
  });

  it('ответ на вопрос бота без сессии — запись сохранена, сессия не создана', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedPending('цигун для глаз', 'средняя группа', 10);
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
      replyToNorecLessonId: lesson._id.toString(),
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      `${SAVED_PREFIX} «цигун для глаз · средняя группа» 21:10, рассылка ждёт отправки.`,
    ]);
    const saved = await ctx.lessonModel.findById(lesson._id).lean();
    expect(saved?.recordings).toHaveLength(1);
    expect(await ctx.botSessionModel.countDocuments({ chatId: 111 })).toBe(0);
  });

  it('ответ на вопрос про несуществующее занятие — объясняет, ничего не создаёт', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
      replyToNorecLessonId: new Types.ObjectId().toString(),
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Занятие не найдено — возможно, его отменили. Запись сохранять некуда.',
    ]);
    expect(await ctx.botSessionModel.countDocuments({ chatId: 111 })).toBe(0);
  });

  it('сохранена запись к последнему ждущему — подтверждение без хвоста, сессия закрыта', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedPending('цигун для глаз', 'средняя группа', 10);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ hours: 11 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
      replyToNorecLessonId: lesson._id.toString(),
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      `${SAVED_PREFIX} «цигун для глаз · средняя группа» 21:10, рассылка ждёт отправки.`,
    ]);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });
});
