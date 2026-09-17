// Кнопка «Опубликовать» диалога «Собрать экзамен» (ТЗ 4б.4, docs/PLAN.md
// §12) — вынесено из new-exam-callback.ts (файл-лимит 150 строк). Валидация
// DTO-лимитов и самого сервиса — через ExamBotPort (ADR-0024, «бот не
// переизобретает правила»), не второй копией. Тем же приёмом, что
// new-exam-item-save-callback.ts у диалога «Новый вопрос».
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import type { UsersService } from '../../users/users.service';
import { examUserFacingError } from './exam-attempt-error';
import { editScreen } from './new-exam-item-callback';
import { withValidationErrors } from './new-exam-item-screens';
import {
  buildCreateExamInput,
  newExamAlreadyPublishedMessage,
  newExamPublishedMessage,
} from './new-exam-save';
import { confirmScreen } from './new-exam-screens';
import { isActiveNewExamDraft, sessionToNewExamDraft } from './new-exam-types';

const NO_USER_MESSAGE =
  'Не нашли ваш аккаунт в кабинете. Откройте кабинет по /start ещё раз.';

export async function handleNewExamPublish(
  ctx: Context,
  botSessions: BotSessionService,
  examBot: ExamBotPort,
  users: UsersService,
  publicUrl: string | undefined,
  chatId: number,
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (!isActiveNewExamDraft(session)) return;

  // Идемпотентность (ТЗ 4б.4) — повторный клик после успешной публикации не
  // зовёт ExamsService.createAndPublishExam() второй раз.
  if (session.buildSavedExamId) {
    const text = newExamAlreadyPublishedMessage(
      session.buildSavedExamId.toString(),
      publicUrl,
    );
    await editScreen(ctx, { text, buttons: [] });
    return;
  }
  if (session.buildStep !== 'confirm') return; // «Опубликовать» на другом шаге не бывает — защита в глубину

  const draft = sessionToNewExamDraft(session);
  const input = buildCreateExamInput(draft);
  try {
    const errors = await examBot.validateExamDraft(input);
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
    const exam = await examBot.createAndPublishExam(input, user.id);
    await botSessions.setNewExamDraft(
      chatId,
      { step: 'confirm', savedExamId: exam.id },
      now,
    );
    await editScreen(ctx, {
      text: newExamPublishedMessage(exam.id, publicUrl),
      buttons: [],
    });
  } catch (err) {
    // Не очищаем черновик — учитель не должен собирать экзамен заново из-за
    // временного сбоя (CLAUDE.md «Хендлер, упавший на середине диалога, не
    // оставляет ожидание навсегда», TTL сам подчистит).
    await editScreen(ctx, { ...confirmScreen(draft), text: examUserFacingError(err) });
  }
}
