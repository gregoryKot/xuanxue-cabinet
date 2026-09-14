// Диспетчер callback-действий экзамена (exam/eq/eo/es) — CallbackQueryHandler
// зовёт его ДО проверки PersonalChats: та пускает только штат школы с
// активным личным каналом, а экзамен сдают ученики (тот же приём, что
// MessageHandler для сессии examMedia — ADR-0023). Владение — по telegramId
// отправителя (CLAUDE.md «Владение»): незнакомец тихо игнорируется, как и
// прочие чужие callback.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { CallbackAction } from '../callback-data';
import type { ExamBotPort } from '../exam-bot.port';
import type { UsersService } from '../../users/users.service';
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
  usersService: UsersService,
  examBot: ExamBotPort,
  now: DateTime,
): Promise<void> {
  const user = await usersService.findByTelegramId(chatId);
  if (!user) return;

  if (action === 'exam') {
    await handleExamStart(ctx, examBot, user, id, now);
    return;
  }
  if (action === 'es') {
    await handleExamSubmit(ctx, examBot, user, id, now);
    return;
  }
  if (action === 'eq') {
    const parsed = parseQuestionId(id);
    if (parsed) await handleExamQuestion(ctx, examBot, user, parsed, now);
    return;
  }
  const parsed = parseOptionId(id);
  if (parsed) await handleExamOption(ctx, examBot, user, parsed, now);
}
