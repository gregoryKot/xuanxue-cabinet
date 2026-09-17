// Общая обвязка спеков «учитель заводит вопрос в боте» (ТЗ 4б.3,
// docs/PLAN.md §12) — поверх setupFlowTest (exam-attempt-flow.test-support.ts):
// та же настоящая Mongo и настоящий ExamBotService/ExamItemsService, плюс
// PersonalChats (доступ штата) и сами хендлеры диалога. Вынесено тем же
// приёмом, что exam-attempt-flow.test-support.ts (jscpd, CLAUDE.md «Файлы»).
import type { Model } from 'mongoose';
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
import { NewExamItemCommandHandler } from './new-exam-item-command.handler';
import { NewExamItemMessageHandler } from './new-exam-item-message.handler';

export { CHAT_ID };

export interface NewExamItemFlowContext {
  flow: FlowTestContext;
  channelModel: Model<ChannelRecord>;
  usersService: UsersService;
  commandHandler: NewExamItemCommandHandler;
  messageHandler: NewExamItemMessageHandler;
}

export async function setupNewExamItemFlowTest(): Promise<NewExamItemFlowContext> {
  const flow = await setupFlowTest();
  const { channelModel, usersService, personalChats } = buildFlowChatRig(flow);
  return {
    flow,
    channelModel,
    usersService,
    commandHandler: new NewExamItemCommandHandler(personalChats),
    messageHandler: new NewExamItemMessageHandler(flow.botSessions, flow.registry),
  };
}

export async function clearNewExamItemFlowTest(
  ctx: NewExamItemFlowContext,
): Promise<void> {
  await clearFlowTest(ctx.flow);
  await ctx.channelModel.deleteMany({});
}

/** Учитель со «штатом» (роль + активный личный канал, PersonalChats) —
 * тем же приёмом, что seedTeacher в других спеках хендлеров бота. */
export async function seedNewExamItemTeacher(ctx: NewExamItemFlowContext): Promise<void> {
  await seedTeacher(ctx.flow.ctx.userModel, ctx.channelModel, CHAT_ID);
}

/** Сообщение с текстом — тот же fakeFlowCtx, что у остальных спеков бота
 * (message: { text }), только явно поименовано для читаемости диалога. */
export function textMessage(text: string): FlowFakeCtx {
  return fakeFlowCtx({ text });
}
