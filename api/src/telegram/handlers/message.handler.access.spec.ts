// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кто
// может писать боту (chatId, from, роль, тип чата) и сбой сервиса внутри
// потока темы. Сам поток темы — message.handler.spec.ts.
import { Types } from 'mongoose';
import { SettingsService } from '../../settings/settings.service';
import { NotFoundError } from '../../common/errors';
import { LessonsService } from '../../lessons/lessons.service';
import { UsersService } from '../../users/users.service';
import { TopicRebuildService } from '../../broadcasts/topic-rebuild.service';
import { BotSessionService } from '../bot-session.service';
import { buildPersonalChats } from '../test-support/build-personal-chats';
import type { ExamMediaMessageHandler } from './exam-media-message.handler';
import type { ExamTextAnswerHandler } from './exam-text-answer.handler';
import { MessageHandler } from './message.handler';
import { RecordingWaitHandler } from './recording-wait.handler';
import { fakeCtx } from './message.handler.fake-ctx';
import { NOW, seedLesson } from './message.handler.seed';
import { seedTeacher } from '../test-support/seed-teacher';
import {
  clearMessageHandlerTest,
  setupMessageHandlerTest,
  type MessageHandlerTestContext,
} from './message.handler.test-support';

describe('MessageHandler — доступ и сбои', () => {
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

  it('нет ctx.from — тихо игнорируется', async () => {
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'тема', noFrom: true });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
  });

  it('чужой Telegram ID — игнорируется', async () => {
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 999, text: 'тема' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
  });

  it('ученик (без ролей) — игнорируется', async () => {
    await ctx.userModel.create({ name: 'Ученик', telegramId: 222, roles: [] });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 222, text: 'тема' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
  });

  it('kind examMedia — зовёт ExamMediaMessageHandler, даже для не-штата школы (ADR-0023)', async () => {
    const attemptId = new Types.ObjectId();
    await ctx.botSessionModel.create({
      chatId: 555,
      kind: 'examMedia',
      attemptId,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx } = fakeCtx({ chatId: 555, videoFileId: 'v1' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(ctx.examMediaHandler.handle).toHaveBeenCalledTimes(1);
    const [, telegramId, session] = ctx.examMediaHandler.handle.mock.calls[0] as [
      unknown,
      number,
      { attemptId: Types.ObjectId },
    ];
    expect(telegramId).toBe(555);
    expect(session.attemptId.toString()).toBe(attemptId.toString());
  });

  it('kind examText — зовёт ExamTextAnswerHandler, даже для не-штата школы', async () => {
    const attemptId = new Types.ObjectId();
    await ctx.botSessionModel.create({
      chatId: 555,
      kind: 'examText',
      attemptId,
      questionIndex: 1,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx } = fakeCtx({ chatId: 555, text: 'мой ответ' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(ctx.examTextHandler.handle).toHaveBeenCalledTimes(1);
    const [, telegramId, session] = ctx.examTextHandler.handle.mock.calls[0] as [
      unknown,
      number,
      { attemptId: Types.ObjectId; questionIndex: number },
    ];
    expect(telegramId).toBe(555);
    expect(session.attemptId.toString()).toBe(attemptId.toString());
    expect(session.questionIndex).toBe(1);
  });

  it('сообщение из группы — игнорируется', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      chatType: 'group',
      text: 'тема',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
  });

  /** MessageHandler с подменённым `LessonsService.update` — общая заготовка
   * для сбоя-не-NotFound и NotFound ниже (CLAUDE.md «Одна механика»). */
  function buildHandlerWithFailingUpdate(
    update: LessonsService['update'],
  ): MessageHandler {
    const usersService = new UsersService(ctx.userModel);
    return new MessageHandler(
      buildPersonalChats(ctx.connection, usersService, ctx.channelModel),
      new BotSessionService(ctx.botSessionModel),
      { update } as unknown as LessonsService,
      new TopicRebuildService(
        ctx.broadcastModel,
        ctx.lessonModel,
        ctx.classModel,
        ctx.deliveryModel,
        new SettingsService(
          ctx.settingsModel,
          ctx.lessonModel,
          ctx.classModel,
          usersService,
        ),
        usersService,
      ),
      new RecordingWaitHandler(
        new BotSessionService(ctx.botSessionModel),
        { update } as unknown as LessonsService,
        ctx.broadcastModel,
        ctx.classModel,
      ),
      { handle: jest.fn() } as unknown as ExamMediaMessageHandler,
      { handle: jest.fn() } as unknown as ExamTextAnswerHandler,
    );
  }

  it('неожиданный сбой (LessonsService.update упал) — просит попробовать ещё раз, ожидание не закрывается', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ minutes: 10 }).toJSDate(),
    });
    const failingHandler = buildHandlerWithFailingUpdate(
      jest.fn().mockRejectedValue(new Error('mongo упал')),
    );
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'новая тема' });

    await expect(failingHandler.handle(msgCtx, NOW)).resolves.toBeUndefined();

    expect(replies).toEqual(['Не получилось сохранить тему. Попробуйте ещё раз.']);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).not.toBeNull();
  });

  it('LessonsService.update — NotFoundError (занятие отменили): понятный текст, ожидание закрывается', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: NOW.plus({ minutes: 10 }).toJSDate(),
    });
    const failingHandler = buildHandlerWithFailingUpdate(
      jest.fn().mockRejectedValue(new NotFoundError('занятие не найдено')),
    );
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'новая тема' });

    await expect(failingHandler.handle(msgCtx, NOW)).resolves.toBeUndefined();

    expect(replies).toEqual([
      'Занятие не найдено — возможно, его отменили. Откройте предпросмотр заново.',
    ]);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });
});
