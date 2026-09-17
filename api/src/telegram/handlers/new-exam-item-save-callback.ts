// Кнопка «Сохранить» диалога «Новый вопрос» (ТЗ 4б.3, docs/PLAN.md §12) —
// вынесено из new-exam-item-callback.ts (файл-лимит 150 строк). Валидация
// DTO-лимитов и самого сервиса — через ExamBotPort (ADR-0024, «бот не
// переизобретает правила»), не второй копией.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import type { UsersService } from '../../users/users.service';
import { editScreen } from './new-exam-item-callback';
import { examUserFacingError } from './exam-attempt-error';
import { confirmScreen, withValidationErrors } from './new-exam-item-screens';
import {
  buildCreateExamItemInput,
  newExamItemAlreadySavedMessage,
  newExamItemSavedMessage,
} from './new-exam-item-save';
import { isActiveExamItemDraft, sessionToNewExamItemDraft } from './new-exam-item-types';

const NO_USER_MESSAGE =
  'Не нашли ваш аккаунт в кабинете. Откройте кабинет по /start ещё раз.';

export async function handleNewExamItemSave(
  ctx: Context,
  botSessions: BotSessionService,
  examBot: ExamBotPort,
  users: UsersService,
  publicUrl: string | undefined,
  chatId: number,
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveExamItemDraft(session)) return;

  // Идемпотентность (ТЗ 4б.3) — повторный клик после успешного сохранения
  // не зовёт ExamItemsService.create() второй раз.
  if (session.draftSavedItemId) {
    const text = newExamItemAlreadySavedMessage(
      session.draftSavedItemId.toString(),
      publicUrl,
    );
    await editScreen(ctx, { text, buttons: [] });
    return;
  }
  if (session.draftStep !== 'confirm') return; // «Сохранить» на другом шаге не бывает — защита в глубину

  const draft = sessionToNewExamItemDraft(session);
  const input = buildCreateExamItemInput(draft);
  try {
    const errors = await examBot.validateExamItemDraft(input);
    if (errors) {
      await editScreen(ctx, withValidationErrors(confirmScreen(draft), errors));
      return;
    }
    const user = await users.findByTelegramId(chatId);
    if (!user) {
      await editScreen(
        ctx,
        withValidationErrors(confirmScreen(draft), [NO_USER_MESSAGE]),
      );
      return;
    }
    const item = await examBot.createExamItem(input, user.id);
    await botSessions.setNewExamItemDraft(
      chatId,
      { step: 'confirm', savedItemId: item.id },
      now,
    );
    await editScreen(ctx, {
      text: newExamItemSavedMessage(item.id, publicUrl),
      buttons: [],
    });
  } catch (err) {
    // Не очищаем черновик — учитель не должен переписывать вопрос заново
    // из-за временного сбоя (CLAUDE.md «Хендлер, упавший на середине
    // диалога, не оставляет ожидание навсегда», TTL сам подчистит).
    await editScreen(ctx, { ...confirmScreen(draft), text: examUserFacingError(err) });
  }
}
