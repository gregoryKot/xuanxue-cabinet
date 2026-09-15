// Диспетчер callback-действий экзамена (exam/eq/eo/es) — CallbackQueryHandler
// зовёт его ДО проверки PersonalChats: та пускает только штат школы с
// активным личным каналом, а экзамен сдают ученики (тот же приём, что
// MessageHandler для сессии examMedia — ADR-0023). Личность и доступ — через
// BotUserAccessService.resolve(): единственная точка, что незнакомец тихо
// игнорируется (как и прочие чужие callback), а blocked/invited получают
// явный отказ вместо доступа к попытке (SECURITY §9, ADR-0026).
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { CallbackAction } from '../callback-data';
import type { BotSessionService } from '../bot-session.service';
import type { BotUserAccessService } from '../bot-user-access.service';
import type { ExamBotPort } from '../exam-bot.port';
import { handleExamOption, handleExamSubmit } from './exam-attempt-answer';
import { handleExamQuestion, handleExamStart } from './exam-attempt-navigation';
import { parseOptionId, parseQuestionId } from './exam-callback-ids';

const EXAM_CALLBACK_ACTIONS = ['exam', 'eq', 'eo', 'es'] as const;

export function isExamCallbackAction(
  action: CallbackAction,
): action is (typeof EXAM_CALLBACK_ACTIONS)[number] {
  return (EXAM_CALLBACK_ACTIONS as readonly string[]).includes(action);
}

export async function routeExamCallback(
  ctx: Context,
  action: CallbackAction,
  id: string,
  chatId: number,
  botAccess: BotUserAccessService,
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  now: DateTime,
): Promise<void> {
  const access = await botAccess.resolve(chatId);
  if (access.kind === 'unknown') return;
  if (access.kind === 'denied') {
    await ctx.editMessageText(access.message).catch(() => null);
    return;
  }
  const user = access.user;

  if (action === 'exam') {
    await handleExamStart(ctx, examBot, botSessions, user, chatId, id, now);
    return;
  }
  if (action === 'es') {
    await handleExamSubmit(ctx, examBot, botSessions, user, chatId, id, now);
    return;
  }
  if (action === 'eq') {
    const parsed = parseQuestionId(id);
    if (parsed) {
      await handleExamQuestion(ctx, examBot, botSessions, user, chatId, parsed, now);
    }
    return;
  }
  const parsed = parseOptionId(id);
  if (parsed)
    await handleExamOption(ctx, examBot, botSessions, user, chatId, parsed, now);
}
