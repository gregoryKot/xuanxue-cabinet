// Сборка входа ExamItemsService.create() и тексты после сохранения (ТЗ 4б.3,
// docs/PLAN.md §12) — чистая логика без Mongo и без Telegram, как
// attempt-submitted-message.ts. Ссылка строится только от PUBLIC_URL
// (ADR-0009: не от заголовка Host) — без него текст остаётся без ссылки, не
// «undefined» в сообщении.
import type { CreateExamItemInput, ExamItemKind } from '@xuanxue/shared';
import type { NewExamItemDraft } from '../new-exam-item-draft-wait';
import { hasOptionsStep } from './new-exam-item-types';

export function buildCreateExamItemInput(draft: NewExamItemDraft): CreateExamItemInput {
  const kind = draft.kind as ExamItemKind; // всегда задан к шагу 'confirm' (screen 1)
  return {
    kind,
    prompt: draft.prompt ?? '',
    options: hasOptionsStep(kind)
      ? draft.options.map((option) => ({ text: option.text, correct: option.correct }))
      : undefined,
  };
}

const SAVED_TEXT = 'Вопрос сохранён, он уже в разделе «Вопросы» кабинета.';
const ALREADY_SAVED_TEXT = 'Этот вопрос уже сохранён, он в разделе «Вопросы» кабинета.';

function withExamItemLink(
  base: string,
  itemId: string,
  publicUrl: string | undefined,
): string {
  if (!publicUrl) return base;
  return `${base}\n${publicUrl}/exam-items/${itemId}`;
}

export function newExamItemSavedMessage(
  itemId: string,
  publicUrl: string | undefined,
): string {
  return withExamItemLink(SAVED_TEXT, itemId, publicUrl);
}

/** Повторный клик «Сохранить» после того, как черновик уже сохранён
 * (idempotency, ТЗ 4б.3) — тот же вопрос, не второй. */
export function newExamItemAlreadySavedMessage(
  itemId: string,
  publicUrl: string | undefined,
): string {
  return withExamItemLink(ALREADY_SAVED_TEXT, itemId, publicUrl);
}
