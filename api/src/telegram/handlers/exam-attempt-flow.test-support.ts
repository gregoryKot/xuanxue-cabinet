// Общая обвязка интеграционных спеков «бот — второй клиент
// ExamAttemptsService» (exam-attempt-flow.spec.ts и его соседи
// exam-attempt-flow.cabinet.spec.ts / exam-attempt-flow.ownership.spec.ts,
// PLAN.md §12 «Тесты, без которых этап не закрыт»): настоящая Mongo
// (mongodb-memory-server, не мок — CLAUDE.md «Тесты»), настоящий
// ExamBotService поверх тех же сервисов, что и кабинет, bot_sessions против
// той же базы. Вынесено тем же приёмом, что callback-query.handler.
// test-support.ts — обвязка одна, спеки разные (jscpd). Фейковый Context и
// пользователь-ученик — exam-flow-fake-ctx.test-support.ts (файл-лимит
// CLAUDE.md «Храповики»), реэкспортированы отсюда — соседние спеки берут их
// по этому же пути.
import type { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { UsersService } from '../../users/users.service';
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

export {
  botUser,
  CHAT_ID,
  fakeFlowCtx,
  type FlowFakeCtx,
} from './exam-flow-fake-ctx.test-support';

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
    ctx.seenMarkModel,
    ctx.examNotifier,
    ctx.examsService,
  );
  const registry = new ExamBotPortRegistry();
  const examBot = new ExamBotService(
    myExamsService,
    ctx.service,
    ctx.gradingsService,
    ctx.mediaAssetsService,
    ctx.examImagesService,
    ctx.examVideosService,
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
