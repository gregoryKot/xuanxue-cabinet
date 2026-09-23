// Кнопки диалога «Собрать экзамен» (ТЗ 4б.4, docs/PLAN.md §12), кроме
// «Опубликовать» (new-exam-save-callback.ts, файл-лимит 150 строк) —
// отметка вопроса, страница, переход к названию, лимит времени, число
// попыток и «Отмена». Личность отправителя (штат с активным чатом) уже
// проверена в CallbackQueryHandler.handle до вызова. `editScreen` — общий
// хелпер с диалогом «Новый вопрос» (new-exam-item-callback.ts), не второй
// реализацией того же самого правки сообщения.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { resolveNewExamDueAt } from './new-exam-due';
import { editScreen } from './new-exam-item-callback';
import { clampPage, pickScreen } from './new-exam-pick-screen';
import {
  attemptsScreen,
  confirmScreen,
  dueAtScreen,
  titleWaitScreen,
} from './new-exam-screens';
import { isActiveNewExamDraft, sessionToNewExamDraft } from './new-exam-types';

function currentItemIds(session: { buildItemIds?: { toString(): string }[] }): string[] {
  return (session.buildItemIds ?? []).map((id) => id.toString());
}

export async function handleNewExamToggleItem(
  ctx: Context,
  botSessions: BotSessionService,
  examBot: ExamBotPort,
  chatId: number,
  itemId: string,
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveNewExamDraft(session) || session.buildStep !== 'pick') return;
  const ids = currentItemIds(session);
  const next = ids.includes(itemId)
    ? ids.filter((id) => id !== itemId)
    : [...ids, itemId];
  const page = session.buildPage ?? 0;
  await botSessions.setNewExamDraft(chatId, { step: 'pick', itemIds: next, page }, now);
  const items = await examBot.listExamItemsToAssemble();
  await editScreen(ctx, pickScreen(items, next, page));
}

export async function handleNewExamPage(
  ctx: Context,
  botSessions: BotSessionService,
  examBot: ExamBotPort,
  chatId: number,
  direction: 'prev' | 'next',
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveNewExamDraft(session) || session.buildStep !== 'pick') return;
  const items = await examBot.listExamItemsToAssemble();
  const current = clampPage(session.buildPage ?? 0, items.length);
  const next = clampPage(direction === 'next' ? current + 1 : current - 1, items.length);
  const ids = currentItemIds(session);
  await botSessions.setNewExamDraft(
    chatId,
    { step: 'pick', itemIds: ids, page: next },
    now,
  );
  await editScreen(ctx, pickScreen(items, ids, next));
}

/** «Собрать (k)» — переход к названию (ТЗ 4б.4). `k` защищена в глубину:
 * кнопка не должна быть видна без отметки (pickScreen), но устаревший клик
 * по прошлому экрану игнорируется молча, тем же приёмом, что «Готово» у
 * диалога «Новый вопрос» (new-exam-item-callback.ts). */
export async function handleNewExamAssemble(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveNewExamDraft(session) || session.buildStep !== 'pick') return;
  const ids = currentItemIds(session);
  if (ids.length === 0) return;
  await botSessions.setNewExamDraft(chatId, { step: 'title', itemIds: ids }, now);
  await editScreen(ctx, titleWaitScreen());
}

const TIME_LIMIT_MINUTES: Partial<Record<string, number>> = {
  '15': 15,
  '30': 30,
  '60': 60,
};

export async function handleNewExamTimeLimit(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  id: string,
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveNewExamDraft(session) || session.buildStep !== 'timeLimit') return;
  const timeLimitMin = TIME_LIMIT_MINUTES[id];
  await botSessions.setNewExamDraft(
    chatId,
    { step: 'attempts', ...(timeLimitMin !== undefined ? { timeLimitMin } : {}) },
    now,
  );
  await editScreen(ctx, attemptsScreen());
}

export async function handleNewExamAttempts(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  id: '1' | '2' | '3',
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveNewExamDraft(session) || session.buildStep !== 'attempts') return;
  await botSessions.setNewExamDraft(
    chatId,
    { step: 'dueAt', attemptsAllowed: Number(id) },
    now,
  );
  await editScreen(ctx, dueAtScreen());
}

/** Срок сдачи (ADR-0125, ADR-0127) — последний шаг перед подтверждением,
 * пресет кнопкой (new-exam-due.ts), не сообщение: экран сразу переходит в
 * 'confirm', как и timeLimit/attempts выше. */
export async function handleNewExamDueAt(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  id: string,
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveNewExamDraft(session) || session.buildStep !== 'dueAt') return;
  const dueAt = resolveNewExamDueAt(id, now);
  await botSessions.setNewExamDraft(
    chatId,
    { step: 'confirm', ...(dueAt !== undefined ? { dueAt } : {}) },
    now,
  );
  const updated = await botSessions.get(chatId, now);
  if (!isActiveNewExamDraft(updated)) return; // TTL истёк между записью и перечитыванием
  await editScreen(ctx, confirmScreen(sessionToNewExamDraft(updated)));
}

export async function handleNewExamCancel(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
): Promise<void> {
  await botSessions.clear(chatId);
  await ctx.editMessageText('Экзамен не собран. Черновик отменён.').catch(() => null);
}
