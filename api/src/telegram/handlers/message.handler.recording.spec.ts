// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): поток
// «Запись?» — источник (ссылка/видео/документ), подтверждение с названием
// занятия, сбои сохранения (saveOrExplain), «не понял» без ожидания. Поток
// темы и доступ — соседние спеки.
import { Types } from 'mongoose';
import { SettingsService } from '../../settings/settings.service';
import type { LessonsService } from '../../lessons/lessons.service';
import { UsersService } from '../../users/users.service';
import { TopicRebuildService } from '../../broadcasts/topic-rebuild.service';
import { BotSessionService } from '../bot-session.service';
import { TeacherChats } from '../teacher-chats';
import { MessageHandler } from './message.handler';
import { fakeCtx } from './message.handler.fake-ctx';
import { NOW, seedLesson } from './message.handler.seed';
import { seedTeacher } from '../test-support/seed-teacher';
import {
  clearMessageHandlerTest,
  setupMessageHandlerTest,
  type MessageHandlerTestContext,
} from './message.handler.test-support';

const NOT_UNDERSTOOD =
  'Не понял, к какому занятию это. Ответьте на сообщение бота о закончившемся ' +
  'занятии или добавьте запись в кабинете, в «Планировании».';
// seedLesson: класс «цигун для глаз» в Asia/Jerusalem, startsAt = NOW + 10 мин
// (18:10 UTC) → 21:10 по расписанию школы (сентябрь, летнее время IDT).
const CONFIRM_PENDING =
  'Запись сохранена к занятию «цигун для глаз» 21:10, рассылка ждёт отправки.';
const CONFIRM_SENT = 'Запись сохранена к занятию «цигун для глаз» 21:10, рассылка ушла.';

describe('MessageHandler — поток «Запись?»', () => {
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

  it('активное ожидание + https-ссылка — запись сохранена, сессия закрыта, называет занятие', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([CONFIRM_PENDING]);
    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.recordings).toHaveLength(1);
    expect(updated?.recordings[0]?.url).toBe('https://youtu.be/abc');
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });

  it('вольный текст со ссылкой внутри — берёт первое https:// совпадение, не только начало строки', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'вот запись https://youtu.be/x',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([CONFIRM_PENDING]);
    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.recordings[0]?.url).toBe('https://youtu.be/x');
  });

  it('запись уже разослана (recording-рассылка того же ключа sent) — «ушла»', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.broadcastModel.create({
      kind: 'recording',
      lessonId: lesson._id,
      recordingKey: 'https://youtu.be/abc',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'sent',
    });
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([CONFIRM_SENT]);
  });

  it('активное ожидание + видео — telegramFileId сохраняется', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, videoFileId: 'v1' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toHaveLength(1);
    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.recordings[0]?.telegramFileId).toBe('v1');
  });

  it('активное ожидание + документ video/* — telegramFileId сохраняется', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx } = fakeCtx({
      chatId: 111,
      documentFileId: 'd1',
      documentMimeType: 'video/mp4',
    });

    await ctx.handler.handle(msgCtx, NOW);

    const updated = await ctx.lessonModel.findById(lesson._id).lean();
    expect(updated?.recordings[0]?.telegramFileId).toBe('d1');
  });

  it('активное ожидание + нераспознанное сообщение — ждём дальше, сессия не закрывается', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'скоро пришлю' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).not.toBeNull();
  });

  it('без активного ожидания + ссылка — «не понял», с выполнимым действием', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([NOT_UNDERSTOOD]);
  });

  it('без активного ожидания + видео — «не понял»', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, videoFileId: 'v1' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([NOT_UNDERSTOOD]);
  });

  it('занятие пропало (NotFoundError) — закрывает ожидание, «сохранять некуда»', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const missingLessonId = new Types.ObjectId();
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: missingLessonId,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Занятие не найдено — возможно, его отменили. Запись сохранять некуда.',
    ]);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });

  it('неожиданный сбой (addRecording упал не NotFound) — просит прислать ещё раз, ожидание остаётся', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const failingHandler = buildHandlerWithFailingAddRecording(
      ctx,
      jest.fn().mockRejectedValue(new Error('mongo упал')),
    );
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      text: 'https://youtu.be/abc',
    });

    await expect(failingHandler.handle(msgCtx, NOW)).resolves.toBeUndefined();

    expect(replies).toEqual(['Не получилось сохранить запись. Пришлите ещё раз.']);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).not.toBeNull();
  });
});

/** MessageHandler с подменённым `LessonsService.addRecording` — тот же приём,
 * что buildHandlerWithFailingUpdate в message.handler.access.spec.ts. */
function buildHandlerWithFailingAddRecording(
  ctx: MessageHandlerTestContext,
  addRecording: LessonsService['addRecording'],
): MessageHandler {
  const usersService = new UsersService(ctx.userModel);
  return new MessageHandler(
    new TeacherChats(usersService, ctx.channelModel),
    new BotSessionService(ctx.botSessionModel),
    { addRecording } as unknown as LessonsService,
    new TopicRebuildService(
      ctx.broadcastModel,
      ctx.lessonModel,
      ctx.classModel,
      new SettingsService(
        ctx.settingsModel,
        ctx.lessonModel,
        ctx.classModel,
        usersService,
      ),
      usersService,
    ),
    ctx.broadcastModel,
    ctx.classModel,
  );
}
