// Диспетчер кнопок диалога «Собрать экзамен» (ТЗ 4б.4, docs/PLAN.md §12) —
// тем же приёмом, что new-exam-item-router.ts: сама маршрутизация здесь,
// чтобы CallbackQueryHandler.dispatch не разрастался (файл-лимит 150 строк).
// Доступ (штат с активным личным чатом) уже проверен вызывающим кодом
// (CallbackQueryHandler.handle — isPersonalChat, как у nqk/nqo/nqd/nqf).
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { CallbackAction } from '../callback-data';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import type { UsersService } from '../../users/users.service';
import {
  handleNewExamAssemble,
  handleNewExamAttempts,
  handleNewExamCancel,
  handleNewExamDueAt,
  handleNewExamPage,
  handleNewExamTimeLimit,
  handleNewExamToggleItem,
} from './new-exam-callback';
import { handleNewExamPublish } from './new-exam-save-callback';

const NEW_EXAM_ACTIONS = ['net', 'nep', 'nea', 'nel', 'nen', 'ned', 'nef'] as const;

export function isNewExamCallbackAction(
  action: CallbackAction,
): action is (typeof NEW_EXAM_ACTIONS)[number] {
  return (NEW_EXAM_ACTIONS as readonly string[]).includes(action);
}

export async function routeNewExamCallback(
  ctx: Context,
  action: CallbackAction,
  id: string,
  chatId: number,
  botSessions: BotSessionService,
  examBot: ExamBotPort,
  users: UsersService,
  publicUrl: string | undefined,
  now: DateTime,
): Promise<void> {
  if (action === 'net') {
    await handleNewExamToggleItem(ctx, botSessions, examBot, chatId, id, now);
    return;
  }
  if (action === 'nep' && (id === 'prev' || id === 'next')) {
    await handleNewExamPage(ctx, botSessions, examBot, chatId, id, now);
    return;
  }
  if (action === 'nea') {
    await handleNewExamAssemble(ctx, botSessions, chatId, now);
    return;
  }
  if (action === 'nel') {
    await handleNewExamTimeLimit(ctx, botSessions, chatId, id, now);
    return;
  }
  if (action === 'nen' && (id === '1' || id === '2' || id === '3')) {
    await handleNewExamAttempts(ctx, botSessions, chatId, id, now);
    return;
  }
  if (action === 'ned') {
    await handleNewExamDueAt(ctx, botSessions, chatId, id, now);
    return;
  }
  if (action !== 'nef') return;
  if (id === 'cancel') {
    await handleNewExamCancel(ctx, botSessions, chatId);
    return;
  }
  if (id === 'publish') {
    await handleNewExamPublish(ctx, botSessions, examBot, users, publicUrl, chatId, now);
  }
}
