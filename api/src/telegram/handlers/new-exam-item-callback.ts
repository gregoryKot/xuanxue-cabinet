// Кнопки диалога «Новый вопрос» (ТЗ 4б.3, docs/PLAN.md §12), кроме
// сохранения (new-exam-item-save-callback.ts, файл-лимит 150 строк) — тип,
// переход «Готово» между шагами, отметка верного варианта и «Отмена».
// Личность отправителя (штат с активным чатом) уже проверена в
// CallbackQueryHandler.handle до вызова.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { EXAM_ITEM_LIMITS, type ExamItemKind } from '@xuanxue/shared';
import type { BotSessionService } from '../bot-session.service';
import type { BotMenu } from './bot-menu';
import { confirmScreen, promptWaitScreen } from './new-exam-item-screens';
import { correctWaitScreen } from './new-exam-item-options-screen';
import {
  correctCount,
  isActiveExamItemDraft,
  markOnlyOptionCorrect,
  sessionToNewExamItemDraft,
  toggleOptionCorrect,
} from './new-exam-item-types';

export async function editScreen(ctx: Context, screen: BotMenu): Promise<void> {
  await ctx
    .editMessageText(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
    .catch(() => null);
}

export async function handleNewExamItemKind(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  kind: ExamItemKind,
  now: DateTime,
): Promise<void> {
  await botSessions.startNewExamItemDraft(chatId, kind, now);
  await editScreen(ctx, promptWaitScreen());
}

/** «Готово» шагов 'options'/'correct' (ТЗ 4б.3) — `target` пришёл уже
 * проверенным форматом (callback-params.ts), но не тем ли, что реально
 * открыт: устаревшая кнопка с прошлого экрана того же черновика молча
 * игнорируется (тот же приём, что у «чужого параметра» в других роутерах). */
export async function handleNewExamItemDone(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  target: 'options' | 'correct',
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveExamItemDraft(session) || session.draftStep !== target) return;
  const options = session.draftOptions ?? [];

  if (target === 'options') {
    if (options.length < EXAM_ITEM_LIMITS.optionsMin) return; // кнопка не должна быть видна раньше минимума
    await botSessions.setNewExamItemDraft(chatId, { step: 'correct' }, now);
    await editScreen(ctx, correctWaitScreen(session.draftKind, options));
    return;
  }
  if (correctCount(options) < 1) return; // «Готово» скрыто до первой отметки — защита в глубину
  await botSessions.setNewExamItemDraft(chatId, { step: 'confirm' }, now);
  await editScreen(ctx, confirmScreen(sessionToNewExamItemDraft(session)));
}

/** Отметка верного варианта (nqo) — `single` сразу переходит дальше (та же
 * механика, что у ответа ученика на single-вопрос, exam-attempt-answer.ts),
 * `multiple` — переключатель, «Готово» отдельной кнопкой (handleNewExamItemDone). */
export async function handleNewExamItemOptionToggle(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  optionIndex: number,
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveExamItemDraft(session) || session.draftStep !== 'correct') return;
  const options = session.draftOptions ?? [];
  if (optionIndex >= options.length) return; // устаревшая кнопка — вариантов стало меньше

  if (session.draftKind === 'single') {
    const marked = markOnlyOptionCorrect(options, optionIndex);
    await botSessions.setNewExamItemDraft(
      chatId,
      { step: 'confirm', options: marked },
      now,
    );
    await editScreen(
      ctx,
      confirmScreen({ ...sessionToNewExamItemDraft(session), options: marked }),
    );
    return;
  }
  const toggled = toggleOptionCorrect(options, optionIndex);
  await botSessions.setNewExamItemDraft(
    chatId,
    { step: 'correct', options: toggled },
    now,
  );
  await editScreen(ctx, correctWaitScreen(session.draftKind, toggled));
}

export async function handleNewExamItemCancel(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
): Promise<void> {
  await botSessions.clear(chatId);
  await ctx.editMessageText('Вопрос не заведён. Черновик отменён.').catch(() => null);
}
