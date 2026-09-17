// Сборка входа ExamsService.createAndPublishExam() и тексты после публикации
// (ТЗ 4б.4, docs/PLAN.md §12) — чистая логика без Mongo и без Telegram, тем
// же приёмом, что new-exam-item-save.ts. Ссылка строится только от
// PUBLIC_URL (ADR-0009: не от заголовка Host) — без него текст остаётся без
// ссылки, не «undefined» в сообщении. Единственный блок без заголовка и без
// перемешивания (ADR-0033: структурная работа остаётся в кабинете).
import type { CreateExamInput } from '@xuanxue/shared';
import type { NewExamDraft } from '../new-exam-draft-wait';

export function buildCreateExamInput(draft: NewExamDraft): CreateExamInput {
  return {
    title: draft.title ?? '',
    blocks: [{ itemIds: draft.itemIds }],
    timeLimitMin: draft.timeLimitMin,
    attemptsAllowed: draft.attemptsAllowed,
  };
}

const PUBLISHED_TEXT = 'Экзамен опубликован, ученики видят его в /экзамены.';
const ALREADY_PUBLISHED_TEXT = 'Этот экзамен уже опубликован, он в /экзамены.';

function withExamLink(
  base: string,
  examId: string,
  publicUrl: string | undefined,
): string {
  if (!publicUrl) return base;
  return `${base}\n${publicUrl}/exams/${examId}`;
}

export function newExamPublishedMessage(
  examId: string,
  publicUrl: string | undefined,
): string {
  return withExamLink(PUBLISHED_TEXT, examId, publicUrl);
}

/** Повторный клик «Опубликовать» после того, как черновик уже опубликован
 * (idempotency, ТЗ 4б.4) — тот же экзамен, не вторая форма. */
export function newExamAlreadyPublishedMessage(
  examId: string,
  publicUrl: string | undefined,
): string {
  return withExamLink(ALREADY_PUBLISHED_TEXT, examId, publicUrl);
}
