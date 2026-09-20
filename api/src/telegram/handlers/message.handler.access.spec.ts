// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кто
// может писать боту (chatId, from, роль, тип чата) и сбой сервиса внутри
// потока темы. Сам поток темы — message.handler.spec.ts.
import { Types } from 'mongoose';
import { SettingsService } from '../../settings/settings.service';
import { NotFoundError } from '../../common/errors';
import { LessonsService } from '../../lessons/lessons.service';
import { UsersService } from '../../users/users.service';
import { BroadcastModels } from '../../broadcasts/broadcast-models.provider';
import { LessonLinkRebuildService } from '../../broadcasts/lesson-link-rebuild.service';
import { BotSessionService } from '../bot-session.service';
import { buildPersonalChats } from '../test-support/build-personal-chats';
import type { ExamMediaMessageHandler } from './exam-media-message.handler';
import type { ExamTextAnswerHandler } from './exam-text-answer.handler';
import type { GradeCommentHandler } from './grade-comment.handler';
import type { NewExamMessageHandler } from './new-exam-message.handler';
import type { NewExamItemMessageHandler } from './new-exam-item-message.handler';
import { MessageHandler } from './message.handler';
import type { PaymentScreenshotMessageHandler } from './payment-screenshot-message.handler';
import { RecordingWaitHandler } from './recording-wait.handler';
import { TopicWaitHandler } from './topic-wait.handler';
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

  it('kind payment — зовёт PaymentScreenshotMessageHandler, даже для не-штата школы (ADR-0050)', async () => {
    await ctx.botSessionModel.create({
      chatId: 556,
      kind: 'payment',
      month: '2026-09',
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx } = fakeCtx({ chatId: 556, text: 'фото' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(ctx.paymentScreenshotHandler.handle).toHaveBeenCalledTimes(1);
    const [, telegramId, session] = ctx.paymentScreenshotHandler.handle.mock.calls[0] as [
      unknown,
      number,
      { month: string },
    ];
    expect(telegramId).toBe(556);
    expect(session.month).toBe('2026-09');
  });

  it('ученик, ожидание payment истекло — своя фраза про скриншот, не про экзамен', async () => {
    await ctx.botSessionModel.create({
      chatId: 557,
      kind: 'payment',
      month: '2026-09',
      expiresAt: NOW.minus({ minutes: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 557, text: 'опоздавшее фото' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Ссылка на отправку скриншота устарела. Откройте «Отправить скриншот» в кабинете ещё раз.',
    ]);
  });

  it('kind examItemDraft — зовёт NewExamItemMessageHandler (ТЗ 4б.3, только штат)', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 777);
    await ctx.botSessionModel.create({
      chatId: 777,
      kind: 'examItemDraft',
      draftStep: 'prompt',
      draftKind: 'text',
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx } = fakeCtx({ chatId: 777, text: 'Опишите форму' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(ctx.newExamItemHandler.handle).toHaveBeenCalledTimes(1);
    const [, telegramId, session] = ctx.newExamItemHandler.handle.mock.calls[0] as [
      unknown,
      number,
      { draftKind: string },
    ];
    expect(telegramId).toBe(777);
    expect(session.draftKind).toBe('text');
  });

  it('штат, ожидание examItemDraft истекло — фраза про черновик вопроса, не про тему', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 778);
    await ctx.botSessionModel.create({
      chatId: 778,
      kind: 'examItemDraft',
      draftStep: 'prompt',
      draftKind: 'text',
      expiresAt: NOW.minus({ minutes: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 778,
      text: 'опоздавшая формулировка',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Время на вопрос истекло. Наберите /вопрос ещё раз — черновик придётся начать заново.',
    ]);
  });

  it('ученик (без ролей), ожидание examItemDraft истекло — тихо игнорируется (гейт штата)', async () => {
    await ctx.userModel.create({ name: 'Ученик', telegramId: 779, roles: [] });
    await ctx.botSessionModel.create({
      chatId: 779,
      kind: 'examItemDraft',
      draftStep: 'prompt',
      draftKind: 'text',
      expiresAt: NOW.minus({ minutes: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 779, text: 'не моё дело' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
  });

  it('kind examBuildDraft — зовёт NewExamMessageHandler (ТЗ 4б.4, только штат)', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 780);
    await ctx.botSessionModel.create({
      chatId: 780,
      kind: 'examBuildDraft',
      buildStep: 'title',
      buildItemIds: [],
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: msgCtx } = fakeCtx({ chatId: 780, text: 'Экзамен по форме' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(ctx.newExamHandler.handle).toHaveBeenCalledTimes(1);
    const [, telegramId, session] = ctx.newExamHandler.handle.mock.calls[0] as [
      unknown,
      number,
      { buildStep: string },
    ];
    expect(telegramId).toBe(780);
    expect(session.buildStep).toBe('title');
  });

  it('штат, ожидание examBuildDraft истекло — фраза про черновик экзамена, не про тему', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 781);
    await ctx.botSessionModel.create({
      chatId: 781,
      kind: 'examBuildDraft',
      buildStep: 'title',
      buildItemIds: [],
      expiresAt: NOW.minus({ minutes: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 781,
      text: 'опоздавшее название',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Время на сборку экзамена истекло. Наберите /экзамен ещё раз — черновик придётся начать заново.',
    ]);
  });

  it('ученик (без ролей), ожидание examBuildDraft истекло — тихо игнорируется (гейт штата)', async () => {
    await ctx.userModel.create({ name: 'Ученик', telegramId: 782, roles: [] });
    await ctx.botSessionModel.create({
      chatId: 782,
      kind: 'examBuildDraft',
      buildStep: 'title',
      buildItemIds: [],
      expiresAt: NOW.minus({ minutes: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 782, text: 'не моё дело' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([]);
  });

  it('ученик (без ролей), ожидание examText истекло — фраза про истечение, не тишина (PR #175)', async () => {
    await ctx.userModel.create({ name: 'Ученик', telegramId: 333, roles: [] });
    await ctx.botSessionModel.create({
      chatId: 333,
      kind: 'examText',
      attemptId: new Types.ObjectId(),
      questionIndex: 0,
      expiresAt: NOW.minus({ minutes: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 333, text: 'опоздавший ответ' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Ожидание ответа истекло. Откройте экзамен снова: команда /экзамены в боте или кнопка в кабинете.',
    ]);
  });

  it('ученик, ожидание examMedia истекло — та же фраза, гейт personalChats его не блокирует', async () => {
    await ctx.botSessionModel.create({
      chatId: 444,
      kind: 'examMedia',
      attemptId: new Types.ObjectId(),
      expiresAt: NOW.minus({ minutes: 1 }).toJSDate(),
    });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 444, videoFileId: 'v1' });

    await ctx.handler.handle(msgCtx, NOW);

    expect(replies).toEqual([
      'Ожидание ответа истекло. Откройте экзамен снова: команда /экзамены в боте или кнопка в кабинете.',
    ]);
  });

  it('штат: ожидание темы истекло — прежняя фраза, не про экзамен', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
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
      new TopicWaitHandler(
        new BotSessionService(ctx.botSessionModel),
        { update } as unknown as LessonsService,
        new LessonLinkRebuildService(
          new BroadcastModels(
            ctx.lessonModel,
            ctx.classModel,
            ctx.channelModel,
            ctx.broadcastModel,
            ctx.deliveryModel,
          ),
          new SettingsService(
            ctx.settingsModel,
            ctx.lessonModel,
            ctx.classModel,
            usersService,
          ),
          usersService,
        ),
      ),
      new RecordingWaitHandler(
        new BotSessionService(ctx.botSessionModel),
        { update } as unknown as LessonsService,
        ctx.broadcastModel,
        ctx.classModel,
      ),
      { handle: jest.fn() } as unknown as ExamMediaMessageHandler,
      { handle: jest.fn() } as unknown as ExamTextAnswerHandler,
      { handle: jest.fn() } as unknown as PaymentScreenshotMessageHandler,
      { handle: jest.fn() } as unknown as NewExamItemMessageHandler,
      { handle: jest.fn() } as unknown as NewExamMessageHandler,
      { handle: jest.fn() } as unknown as GradeCommentHandler,
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
