// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// поток «активное ожидание темы» — сохранение, пересборка текста, ожидание
// не-текста. Доступ (чужой чат, группа, сбой сервиса) — message.handler.access.spec.ts.
import { DateTime } from 'luxon';
import { encryptSchemaFrom } from '../../common/field-policy';
import { decrypt, encryptRecord } from '../../utils/encryption';
import { BROADCAST_FIELD_POLICY } from '../../broadcasts/broadcast.schema';
import {
  clearMessageHandlerTest,
  fakeCtx,
  NOW,
  seedLesson,
  seedTeacher,
  setupMessageHandlerTest,
  type MessageHandlerTestContext,
} from './message.handler.test-support';

const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

describe('MessageHandler — поток темы', () => {
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

  it('активное ожидание темы + текст — тема сохраняется, сессия закрывается', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      // MessageHandler сам зовёт DateTime.utc() (реальные часы, не NOW теста —
      // тем же приёмом, что AuthGuard, CLAUDE.md «Время»): срок жизни сессии
      // считаем от него, иначе истёкшая сессия не найдётся в get().
      expiresAt: DateTime.utc().plus({ minutes: 10 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'новая тема занятия' });

    await ctx.handler.handle(msgCtx);

    expect(replies).toEqual(['Тема сохранена: новая тема занятия']);
    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.topic).toBe('новая тема занятия');
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });

  it('пересобирает текст scheduled-рассылки этого занятия', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: 'старый текст',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: DateTime.utc().plus({ minutes: 10 }).toJSDate(),
    });
    const { ctx: msgCtx } = fakeCtx({ chatId: 111, text: 'вечерняя практика' });

    await ctx.handler.handle(msgCtx);

    const broadcast = await ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(decrypt(broadcast?.text)).toContain('вечерняя практика');
  });

  it('без активного ожидания — тихо игнорирует сообщение', async () => {
    await seedTeacher(ctx.userModel, 111);
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'привет' });

    await ctx.handler.handle(msgCtx);

    expect(replies).toEqual([]);
  });

  it('видео вместо текста при ожидании темы — ждём дальше, сессия не закрывается', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: DateTime.utc().plus({ minutes: 10 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111 });

    await ctx.handler.handle(msgCtx);

    expect(replies).toEqual([]);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).not.toBeNull();
  });
});
