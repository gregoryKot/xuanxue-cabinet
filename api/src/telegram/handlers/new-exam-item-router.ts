// Диспетчер кнопок диалога «Новый вопрос» (ТЗ 4б.3, docs/PLAN.md §12) — тем
// же приёмом, что exam-callback-router.ts: сама маршрутизация здесь, чтобы
// CallbackQueryHandler.dispatch не разрастался (файл-лимит 150 строк).
// Доступ (штат с активным личным чатом) уже проверен вызывающим кодом
// (CallbackQueryHandler.handle — isPersonalChat, как у topic/notif).
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { CallbackAction } from '../callback-data';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import type { UsersService } from '../../users/users.service';
import {
  handleNewExamItemCancel,
  handleNewExamItemDone,
  handleNewExamItemKind,
  handleNewExamItemOptionToggle,
} from './new-exam-item-callback';
import { handleNewExamItemSave } from './new-exam-item-save-callback';
import { isExamItemKind } from './new-exam-item-types';

const NEW_EXAM_ITEM_ACTIONS = ['nqk', 'nqo', 'nqd', 'nqf'] as const;

export function isNewExamItemCallbackAction(
  action: CallbackAction,
): action is (typeof NEW_EXAM_ITEM_ACTIONS)[number] {
  return (NEW_EXAM_ITEM_ACTIONS as readonly string[]).includes(action);
}

export async function routeNewExamItemCallback(
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
  if (action === 'nqk' && isExamItemKind(id)) {
    await handleNewExamItemKind(ctx, botSessions, chatId, id, now);
    return;
  }
  if (action === 'nqo') {
    await handleNewExamItemOptionToggle(ctx, botSessions, chatId, Number(id), now);
    return;
  }
  if (action === 'nqd' && (id === 'options' || id === 'correct')) {
    await handleNewExamItemDone(ctx, botSessions, chatId, id, now);
    return;
  }
  if (action !== 'nqf') return;
  if (id === 'cancel') {
    await handleNewExamItemCancel(ctx, botSessions, chatId);
    return;
  }
  if (id === 'save') {
    await handleNewExamItemSave(ctx, botSessions, examBot, users, publicUrl, chatId, now);
  }
}
