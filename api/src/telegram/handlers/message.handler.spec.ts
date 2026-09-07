// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// поток «активное ожидание темы» — сохранение, пересборка текста, ожидание
// не-текста. Доступ (чужой чат, группа, сбой сервиса) — message.handler.access.spec.ts.
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

  it('активное ожидание темы + текст, рассылка ещё scheduled — тема сохраняется, сессия закрывается', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    // Реалистичное предусловие: кнопка «Изменить тему» приходит из
    // предпросмотра, а предпросмотр шлётся только для уже существующей
    // scheduled-рассылки (PreviewService) — без неё rebuild() вернёт false и
    // ответ получит суффикс «пост уже ушёл», что здесь было бы неправдой.
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
      // now в handle() — параметр (CLAUDE.md «Время»), тест сам решает, что
      // считать «сейчас»: срок жизни сессии — тот же NOW, что ниже в handle().
      expiresAt: NOW.plus({ minutes: 10 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'новая тема занятия' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual(['Тема сохранена: новая тема занятия']);
    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.topic).toBe('новая тема занятия');
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });

  it('активное ожидание темы, но рассылка уже ушла (или её никогда не было) — тема сохраняется с пометкой', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ minutes: 10 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'новая тема занятия' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Тема сохранена: новая тема занятия. Пост уже ушёл в каналы со старой темой.',
    ]);
    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.topic).toBe('новая тема занятия');
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
      expiresAt: NOW.plus({ minutes: 10 }).toJSDate(),
    });
    const { ctx: msgCtx } = fakeCtx({ chatId: 111, text: 'вечерняя практика' });

    await ctx.handler.handle(msgCtx, NOW);

    const broadcast = await ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(decrypt(broadcast?.text)).toContain('вечерняя практика');
  });

  it('без активного ожидания — тихо игнорирует сообщение', async () => {
    await seedTeacher(ctx.userModel, 111);
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'привет' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
  });

  it('видео вместо текста при ожидании темы — ждём дальше, сессия не закрывается', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ minutes: 10 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111 });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).not.toBeNull();
  });

  it('команда (текст с "/") при ожидании темы — не становится темой, ждём дальше', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ minutes: 10 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: '/тема' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.topic).toBe('старая тема');
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).not.toBeNull();
  });

  it('ожидание истекло (expiresAt < now) — бот занятие не трогает, отвечает, что истекло', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: NOW.minus({ minutes: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'новая тема' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Ожидание истекло. Нажмите «Изменить тему» под сообщением ещё раз.',
    ]);
    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.topic).toBe('старая тема');
  });
});
