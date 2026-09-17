// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// бот — второй клиент ExamAttemptsService/MyExamsService (ADR-0024) через
// ExamBotService (реализация ExamBotPort). Read-after-write: ответ,
// сохранённый из бота, виден в следующем рендере того же вопроса; чужая
// попытка не отвечает (SECURITY §3). Text/video (ТЗ 4б.2 часть 2) — то же,
// плюс bot_sessions (BotSessionService) против той же Mongo, не мок модели.
import { DateTime } from 'luxon';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import { AUTHOR_ID, USER_A, USER_B } from '../../exams/exam-attempts.test-support';
import { handleExamOption, handleExamSubmit } from './exam-attempt-answer';
import {
  botUser as user,
  CHAT_ID,
  clearFlowTest,
  fakeFlowCtx as fakeCtx,
  NO_TEACHER_CHATS,
  publishedFlowExam,
  setupFlowTest,
  type FlowTestContext,
} from './exam-attempt-flow.test-support';
import { handleExamQuestion, handleExamStart } from './exam-attempt-navigation';
import { ExamMediaMessageHandler } from './exam-media-message.handler';
import { ExamTextAnswerHandler } from './exam-text-answer.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
// Сигнатура JPEG (exam-image-upload.ts определяет формат по байтам, не по
// заголовку) — тот же фикстурный набор байтов, что exam-images.service.spec.ts.
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe('бот — второй клиент ExamAttemptsService (интеграция, Mongo)', () => {
  let flow: FlowTestContext;
  let ctx: FlowTestContext['ctx'];
  let examBot: FlowTestContext['examBot'];
  let registry: FlowTestContext['registry'];
  let botSessions: FlowTestContext['botSessions'];

  beforeAll(async () => {
    flow = await setupFlowTest();
    ({ ctx, examBot, registry, botSessions } = flow);
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearFlowTest(flow);
  });

  async function publishedExam(
    kind: 'single' | 'text' | 'video',
  ): Promise<{ examId: string; itemId: string }> {
    const { examId, itemIds } = await publishedFlowExam(ctx, [kind], NOW);
    return { examId, itemId: itemIds[0] ?? '' };
  }

  it('ExamBotService.listMyExams — то же, что видит кабинет ученика', async () => {
    const { examId } = await publishedExam('single');
    await handleExamStart(
      fakeCtx().ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );

    const exams = await examBot.listMyExams(user(USER_A), NOW);

    expect(exams).toHaveLength(1);
    expect(exams[0]?.lastAttempt?.status).toBe('in_progress');
  });

  it('ответ, сохранённый из бота, виден в попытке при следующем рендере (read-after-write)', async () => {
    const { examId } = await publishedExam('single');
    const start = fakeCtx();
    await handleExamStart(
      start.ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );
    expect(start.edits[0]).toContain('Вопрос 1 из 1');
    expect(start.edits[0]).not.toContain('✓');

    const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    const attemptId = attempts[0]?.id;
    expect(attemptId).toBeDefined();
    if (!attemptId) throw new Error('unreachable');

    const answer = fakeCtx();
    await handleExamOption(
      answer.ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      { attemptId, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    const reread = fakeCtx();
    await handleExamQuestion(
      reread.ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      { attemptId, index: 0 },
      NOW,
    );
    expect(reread.buttonTexts[0]).toContain('✓ Три');
  });

  it('чужая попытка не отвечает — ATTEMPT_NOT_FOUND_MESSAGE, не содержимое', async () => {
    const { examId } = await publishedExam('single');
    const start = fakeCtx();
    await handleExamStart(
      start.ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );

    const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    const attemptId = attempts[0]?.id;
    if (!attemptId) throw new Error('unreachable');

    const stranger = fakeCtx();
    await handleExamQuestion(
      stranger.ctx,
      examBot,
      botSessions,
      user(USER_B),
      222,
      { attemptId, index: 0 },
      NOW,
    );
    expect(stranger.edits).toEqual(['Попытка не найдена. Обновите страницу.']);

    const strangerOption = fakeCtx();
    await handleExamOption(
      strangerOption.ctx,
      examBot,
      botSessions,
      user(USER_B),
      222,
      { attemptId, questionIndex: 0, optionIndex: 0 },
      NOW,
    );
    expect(strangerOption.edits).toEqual(['Попытка не найдена. Обновите страницу.']);
  });

  it('«Сдать» переводит попытку в submitted — видно в следующем чтении', async () => {
    const { examId } = await publishedExam('single');
    const start = fakeCtx();
    await handleExamStart(
      start.ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );
    const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    const attemptId = attempts[0]?.id;
    if (!attemptId) throw new Error('unreachable');

    const submit = fakeCtx();
    await handleExamSubmit(
      submit.ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      attemptId,
      NOW,
    );
    expect(submit.edits).toEqual([
      'Работа отправлена. Учитель проверит и пришлёт результат.',
    ]);

    const after = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    expect(after[0]?.status).toBe('submitted');
  });

  it('вопрос text: старт ставит examText-ожидание в bot_sessions, сообщение сохраняет ответ', async () => {
    const { examId, itemId } = await publishedExam('text');
    const start = fakeCtx();
    await handleExamStart(
      start.ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );
    expect(start.edits[0]).toContain('Напишите ответ сообщением');

    const session = await botSessions.get(CHAT_ID, NOW);
    expect(session?.kind).toBe('examText');
    expect(session?.questionIndex).toBe(0);
    if (!session) throw new Error('unreachable');

    const botAccess = fakeBotUserAccess(activeAccess(user(USER_A)));
    const textHandler = new ExamTextAnswerHandler(botSessions, botAccess, registry);
    const message = fakeCtx({ text: 'Форма выглядит так' });
    await textHandler.handle(message.ctx, CHAT_ID, session, NOW);

    expect(message.replies[0]).toContain('Ваш ответ: «Форма выглядит так»');
    // Единственный вопрос формы — экран остаётся на нём же (эхо ответа,
    // «Сдать»), ожидание переустанавливается под тот же вопрос, а не
    // закрывается: новое сообщение до «Сдать» заменит этот ответ.
    const after = await botSessions.get(CHAT_ID, NOW);
    expect(after?.kind).toBe('examText');
    expect(after?.questionIndex).toBe(0);

    const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    expect(attempts[0]?.answers).toEqual([{ itemId, text: 'Форма выглядит так' }]);
  });

  it('вопрос video: старт ставит examMedia-ожидание с номером вопроса, видео привязывается', async () => {
    const { examId } = await publishedExam('video');
    const start = fakeCtx();
    await handleExamStart(
      start.ctx,
      examBot,
      botSessions,
      user(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );
    expect(start.edits[0]).toContain('Снимите или пришлите видео сюда');

    const session = await botSessions.get(CHAT_ID, NOW);
    expect(session?.kind).toBe('examMedia');
    expect(session?.questionIndex).toBe(0);
    if (!session) throw new Error('unreachable');

    const botAccess = fakeBotUserAccess(activeAccess(user(USER_A)));
    const mediaHandler = new ExamMediaMessageHandler(
      botSessions,
      ctx.mediaAssetsService,
      botAccess,
      NO_TEACHER_CHATS,
      registry,
    );
    const message = fakeCtx({ video: true });
    await mediaHandler.handle(message.ctx, CHAT_ID, session, NOW);

    expect(message.replies[0]).toContain('Видео получено.');
    // Тот же приём, что у text выше — единственный вопрос, ожидание
    // остаётся на нём же, не закрывается.
    const after = await botSessions.get(CHAT_ID, NOW);
    expect(after?.kind).toBe('examMedia');
    expect(after?.questionIndex).toBe(0);

    const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    const media = await ctx.mediaAssetsService.listForAttempt(attempts[0]?.id ?? '');
    expect(media).toHaveLength(1);
  });

  // ADR-0035, ТЗ бота (PLAN.md §12 слой 4б.2) — картинка варианта реально
  // проходит через ExamImagesService.load (не фейковый порт), поэтому здесь,
  // а не в exam-attempt-navigation.spec.ts/exam-attempt-answer.spec.ts.
  describe('картинки вариантов (ADR-0035)', () => {
    async function publishedExamWithImage(
      kind: 'single' | 'multiple',
    ): Promise<{ examId: string }> {
      const image = await ctx.examImagesService.upload(JPEG_BYTES, AUTHOR_ID);
      const item = await ctx.examItemsService.create(
        {
          kind,
          prompt: 'Какая стойка на фото?',
          options: [
            { text: 'Стойка лошади', imageId: image.id, correct: true },
            { text: 'Стойка лука' },
          ],
        },
        AUTHOR_ID,
      );
      await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
      const exam = await ctx.examsService.create(
        { title: 'Стойки', blocks: [{ title: '', itemIds: [item.id] }] },
        AUTHOR_ID,
      );
      await ctx.examsService.update(exam.id, { status: 'published' });
      return { examId: exam.id };
    }

    it('вопрос с картинкой — альбом отправлен до экрана, экран новым сообщением, старое сообщение удалено', async () => {
      const { examId } = await publishedExamWithImage('single');

      const start = fakeCtx();
      await handleExamStart(
        start.ctx,
        examBot,
        botSessions,
        user(USER_A),
        CHAT_ID,
        examId,
        NOW,
      );

      // Старый экран (список экзаменов, показанный кнопкой) убран, чтобы
      // его кнопки не повисли выше альбома.
      expect(start.deletes).toHaveLength(1);
      // Одна картинка — sendPhoto, не sendMediaGroup.
      expect(start.sendPhotoCalls).toHaveLength(1);
      expect(start.sendMediaGroupCalls).toHaveLength(0);
      // Экран пришёл НОВЫМ сообщением, не правкой старого.
      expect(start.edits).toHaveLength(0);
      expect(start.replies).toHaveLength(1);
      expect(start.replies[0]).toContain('Какая стойка на фото?');
    });

    it('переключение варианта в multiple — альбом не повторяется, старое сообщение не удаляется', async () => {
      const { examId } = await publishedExamWithImage('multiple');
      const start = fakeCtx();
      await handleExamStart(
        start.ctx,
        examBot,
        botSessions,
        user(USER_A),
        CHAT_ID,
        examId,
        NOW,
      );
      expect(start.sendPhotoCalls).toHaveLength(1);

      const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
      const attemptId = attempts[0]?.id;
      if (!attemptId) throw new Error('unreachable');

      const toggle = fakeCtx();
      await handleExamOption(
        toggle.ctx,
        examBot,
        botSessions,
        user(USER_A),
        CHAT_ID,
        { attemptId, questionIndex: 0, optionIndex: 1 },
        NOW,
      );

      expect(toggle.sendPhotoCalls).toHaveLength(0);
      expect(toggle.sendMediaGroupCalls).toHaveLength(0);
      expect(toggle.deletes).toHaveLength(0);
      // Тот же вопрос — просто editMessageText, как раньше.
      expect(toggle.edits).toHaveLength(1);
      expect(toggle.replies).toHaveLength(0);
    });
  });
});
