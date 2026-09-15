// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// бот — второй клиент ExamAttemptsService/MyExamsService (ADR-0024) через
// ExamBotService (реализация ExamBotPort). Read-after-write: ответ,
// сохранённый из бота, виден в следующем рендере того же вопроса; чужая
// попытка не отвечает (SECURITY §3). Text/video (ТЗ 4б.2 часть 2) — то же,
// плюс bot_sessions (BotSessionService) против той же Mongo, не мок модели.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import type { UserLean } from '../../users/users.service';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { ExamBotService } from '../../exams/exam-bot.service';
import { MyExamsService } from '../../exams/my-exams.service';
import type { PersonalChats } from '../personal-chats';
import {
  AUTHOR_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from '../../exams/exam-attempts.test-support';
import { handleExamOption, handleExamSubmit } from './exam-attempt-answer';
import { handleExamQuestion, handleExamStart } from './exam-attempt-navigation';
import { ExamMediaMessageHandler } from './exam-media-message.handler';
import { ExamTextAnswerHandler } from './exam-text-answer.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const CHAT_ID = 111;

function user(id: string): UserLean {
  return { id, name: 'Ученик', roles: [], tz: 'Asia/Jerusalem', status: 'active' };
}

function fakeCtx(overrides: { text?: string; video?: boolean } = {}): {
  ctx: Context;
  edits: string[];
  replies: string[];
  buttonTexts: string[][];
} {
  const edits: string[] = [];
  const replies: string[] = [];
  const buttonTexts: string[][] = [];
  const captureButtons = (extra?: {
    reply_markup?: { inline_keyboard?: { text: string }[][] };
  }) =>
    buttonTexts.push(
      (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text),
    );
  const ctx = {
    chat: { id: CHAT_ID, type: 'private' },
    message: overrides.video
      ? { message_id: 1, video: { file_id: 'f1', file_unique_id: 'u1' } }
      : { message_id: 1, text: overrides.text ?? '' },
    editMessageText: (text: string, extra?: Parameters<typeof captureButtons>[0]) => {
      edits.push(text);
      captureButtons(extra);
      return Promise.resolve(true);
    },
    reply: (text: string, extra?: Parameters<typeof captureButtons>[0]) => {
      replies.push(text);
      captureButtons(extra);
      return Promise.resolve();
    },
    telegram: {
      sendMessage: () => Promise.resolve(),
      copyMessage: () => Promise.resolve(),
    },
  } as unknown as Context;
  return { ctx, edits, replies, buttonTexts };
}

const NO_TEACHER_CHATS: PersonalChats = {
  list: jest.fn().mockResolvedValue([]),
  // `listFor` — пересылка видео экзамена спрашивает его, не `list()`
  // (аудит 2026-09, находка 1, exam-media-forward.ts).
  listFor: jest.fn().mockResolvedValue([]),
} as unknown as PersonalChats;

describe('бот — второй клиент ExamAttemptsService (интеграция, Mongo)', () => {
  let ctx: AttemptsTestContext;
  let examBot: ExamBotService;
  let registry: ExamBotPortRegistry;
  let botSessions: BotSessionService;
  let botSessionModel: Model<BotSessionRecord>;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    const connection: Connection = ctx.memory.connection;
    botSessionModel = connection.model<BotSessionRecord>(
      BotSessionRecord.name,
      BotSessionSchema,
    );
    await botSessionModel.syncIndexes();
    botSessions = new BotSessionService(botSessionModel);
    const myExamsService = new MyExamsService(
      ctx.examModel,
      ctx.attemptModel,
      ctx.gradingModel,
      ctx.examNotifier,
    );
    registry = new ExamBotPortRegistry();
    examBot = new ExamBotService(
      myExamsService,
      ctx.service,
      ctx.mediaAssetsService,
      registry,
    );
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
    await botSessionModel.deleteMany({});
  });

  async function publishedExam(
    kind: 'single' | 'text' | 'video',
  ): Promise<{ examId: string; itemId: string }> {
    const item = await ctx.examItemsService.create(
      kind === 'single'
        ? {
            kind,
            prompt: 'Сколько форм в третьем уровне?',
            options: [
              { text: 'Три', correct: true },
              { text: 'Пять', correct: false },
            ],
          }
        : {
            kind,
            prompt: kind === 'text' ? 'Опишите форму словами' : 'Покажите форму на видео',
          },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Форма третьего уровня', blocks: [{ title: '', itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    return { examId: exam.id, itemId: item.id };
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
});
