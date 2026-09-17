// Общая обвязка спеков «учитель собирает экзамен в боте» (ТЗ 4б.4,
// docs/PLAN.md §12) — поверх setupFlowTest (exam-attempt-flow.test-support.ts):
// та же настоящая Mongo и настоящий ExamBotService поверх ExamsService/
// ExamItemsService, плюс PersonalChats (доступ штата) и сами хендлеры
// диалога. Вынесено тем же приёмом, что new-exam-item-flow.test-support.ts
// (jscpd, CLAUDE.md «Файлы»).
import type { Model } from 'mongoose';
import { AUTHOR_ID } from '../../exams/exam-attempts.test-support';
import type { ChannelRecord } from '../../channels/channel.schema';
import type { UsersService } from '../../users/users.service';
import { seedTeacher } from '../test-support/seed-teacher';
import {
  buildFlowChatRig,
  CHAT_ID,
  clearFlowTest,
  fakeFlowCtx,
  setupFlowTest,
  type FlowFakeCtx,
  type FlowTestContext,
} from './exam-attempt-flow.test-support';
import { NewExamCommandHandler } from './new-exam-command.handler';
import { NewExamMessageHandler } from './new-exam-message.handler';

export { CHAT_ID };

export interface NewExamFlowContext {
  flow: FlowTestContext;
  channelModel: Model<ChannelRecord>;
  usersService: UsersService;
  commandHandler: NewExamCommandHandler;
  messageHandler: NewExamMessageHandler;
}

export async function setupNewExamFlowTest(): Promise<NewExamFlowContext> {
  const flow = await setupFlowTest();
  const { channelModel, usersService, personalChats } = buildFlowChatRig(flow);
  return {
    flow,
    channelModel,
    usersService,
    commandHandler: new NewExamCommandHandler(
      personalChats,
      flow.registry,
      flow.botSessions,
    ),
    messageHandler: new NewExamMessageHandler(flow.botSessions, flow.registry),
  };
}

export async function clearNewExamFlowTest(ctx: NewExamFlowContext): Promise<void> {
  await clearFlowTest(ctx.flow);
  await ctx.channelModel.deleteMany({});
}

/** Учитель со «штатом» (роль + активный личный канал, PersonalChats) —
 * тем же приёмом, что seedTeacher в других спеках хендлеров бота. */
export async function seedNewExamTeacher(ctx: NewExamFlowContext): Promise<void> {
  await seedTeacher(ctx.flow.ctx.userModel, ctx.channelModel, CHAT_ID);
}

/** Опубликованный вопрос банка, готовый для отметки на шаге 'pick' — тем же
 * сервисом, что и кабинет (ExamItemsService), не напрямую через модель. */
export async function publishedFlowItem(
  ctx: NewExamFlowContext,
  prompt: string,
): Promise<string> {
  const item = await ctx.flow.ctx.examItemsService.create(
    { kind: 'text', prompt },
    AUTHOR_ID,
  );
  return item.id;
}

/** Сообщение с текстом — тот же fakeFlowCtx, что у остальных спеков бота. */
export function textMessage(text: string): FlowFakeCtx {
  return fakeFlowCtx({ text });
}
