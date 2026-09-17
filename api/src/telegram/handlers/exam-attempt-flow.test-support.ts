// Общая обвязка интеграционных спеков «бот — второй клиент
// ExamAttemptsService» (exam-attempt-flow.spec.ts и его соседи
// exam-attempt-flow.cabinet.spec.ts / exam-attempt-flow.ownership.spec.ts,
// PLAN.md §12 «Тесты, без которых этап не закрыт»): настоящая Mongo
// (mongodb-memory-server, не мок — CLAUDE.md «Тесты»), настоящий
// ExamBotService поверх тех же сервисов, что и кабинет, bot_sessions против
// той же базы. Вынесено тем же приёмом, что callback-query.handler.
// test-support.ts — обвязка одна, спеки разные (jscpd).
import type { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { UsersService } from '../../users/users.service';
import type { UserLean } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { ExamBotService } from '../../exams/exam-bot.service';
import { MyExamsService } from '../../exams/my-exams.service';
import { buildPersonalChats } from '../test-support/build-personal-chats';
import type { PersonalChats } from '../personal-chats';
import {
  AUTHOR_ID,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from '../../exams/exam-attempts.test-support';

export const CHAT_ID = 111;

// Фото для sendPhoto/sendMediaGroup (ADR-0035) — два размера, самый большой
// последним: exam-question-album-send.ts берёт file_id именно так.
const SENT_PHOTO_SIZES = [{ file_id: 'f-small' }, { file_id: 'f-big' }];

export function botUser(id: string): UserLean {
  return { id, name: 'Ученик', roles: [], tz: 'Asia/Jerusalem', status: 'active' };
}

export interface FlowFakeCtx {
  ctx: Context;
  edits: string[];
  replies: string[];
  buttonTexts: string[][];
  deletes: number[];
  sendPhotoCalls: unknown[][];
  sendMediaGroupCalls: unknown[][];
}

export function fakeFlowCtx(
  overrides: { text?: string; video?: boolean } = {},
): FlowFakeCtx {
  const edits: string[] = [];
  const replies: string[] = [];
  const buttonTexts: string[][] = [];
  const deletes: number[] = [];
  const sendPhotoCalls: unknown[][] = [];
  const sendMediaGroupCalls: unknown[][] = [];
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
    deleteMessage: () => {
      deletes.push(1);
      return Promise.resolve(true);
    },
    telegram: {
      sendMessage: () => Promise.resolve(),
      copyMessage: () => Promise.resolve(),
      sendPhoto: (chatId: number, media: unknown, extra: unknown) => {
        sendPhotoCalls.push([chatId, media, extra]);
        return Promise.resolve({ message_id: 900, photo: SENT_PHOTO_SIZES });
      },
      sendMediaGroup: (chatId: number, media: unknown[]) => {
        sendMediaGroupCalls.push([chatId, media]);
        return Promise.resolve(
          media.map((_, i) => ({ message_id: 900 + i, photo: SENT_PHOTO_SIZES })),
        );
      },
    },
  } as unknown as Context;
  return {
    ctx,
    edits,
    replies,
    buttonTexts,
    deletes,
    sendPhotoCalls,
    sendMediaGroupCalls,
  };
}

export const NO_TEACHER_CHATS: PersonalChats = {
  list: jest.fn().mockResolvedValue([]),
  // `listFor` — пересылка видео экзамена спрашивает его, не `list()`
  // (аудит 2026-09, находка 1, exam-media-forward.ts).
  listFor: jest.fn().mockResolvedValue([]),
} as unknown as PersonalChats;

export interface FlowTestContext {
  ctx: AttemptsTestContext;
  examBot: ExamBotService;
  registry: ExamBotPortRegistry;
  botSessions: BotSessionService;
  botSessionModel: Model<BotSessionRecord>;
}

export async function setupFlowTest(): Promise<FlowTestContext> {
  const ctx = await setupAttemptsTest();
  const connection: Connection = ctx.memory.connection;
  const botSessionModel = connection.model<BotSessionRecord>(
    BotSessionRecord.name,
    BotSessionSchema,
  );
  await botSessionModel.syncIndexes();
  const botSessions = new BotSessionService(botSessionModel);
  const myExamsService = new MyExamsService(
    ctx.examModel,
    ctx.attemptModel,
    ctx.gradingModel,
    ctx.examNotifier,
  );
  const registry = new ExamBotPortRegistry();
  const examBot = new ExamBotService(
    myExamsService,
    ctx.service,
    ctx.mediaAssetsService,
    ctx.examImagesService,
    ctx.examItemsService,
    ctx.examsService,
    registry,
  );
  return { ctx, examBot, registry, botSessions, botSessionModel };
}

export async function clearFlowTest(flow: FlowTestContext): Promise<void> {
  await clearAttemptsTest(flow.ctx);
  await flow.botSessionModel.deleteMany({});
}

export interface FlowChatRig {
  channelModel: Model<ChannelRecord>;
  usersService: UsersService;
  personalChats: PersonalChats;
}

/** Модель канала, UsersService и PersonalChats поверх той же Mongo, что
 * setupFlowTest — общий рубеж доступа штата для спеков диалогов бота
 * («Новый вопрос», «Собрать экзамен», …), не по одной сборке на диалог
 * (jscpd). Вызывающий код сам чистит `channelModel` в своём clear*Test —
 * здесь только сборка, без стороннего эффекта на очистку. */
export function buildFlowChatRig(flow: FlowTestContext): FlowChatRig {
  const connection: Connection = flow.ctx.memory.connection;
  const channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  const usersService = new UsersService(flow.ctx.userModel);
  const personalChats = buildPersonalChats(connection, usersService, channelModel);
  return { channelModel, usersService, personalChats };
}

export type FlowQuestionKind = 'single' | 'text' | 'video';

/** Опубликованная форма из вопросов перечисленных видов, по одному блоку на
 * вопрос — той же дорогой, что учитель в кабинете (ExamItemsService/
 * ExamsService), не напрямую через модель. */
export async function publishedFlowExam(
  ctx: AttemptsTestContext,
  kinds: readonly FlowQuestionKind[],
  now: DateTime,
  options: { timeLimitMin?: number } = {},
): Promise<{ examId: string; itemIds: string[] }> {
  const itemIds: string[] = [];
  for (const kind of kinds) {
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
    await ctx.examItemsService.update(item.id, { status: 'published' }, now);
    itemIds.push(item.id);
  }
  const exam = await ctx.examsService.create(
    {
      title: 'Форма третьего уровня',
      blocks: itemIds.map((id) => ({ title: '', itemIds: [id] })),
      timeLimitMin: options.timeLimitMin,
    },
    AUTHOR_ID,
  );
  await ctx.examsService.update(exam.id, { status: 'published' });
  return { examId: exam.id, itemIds };
}
