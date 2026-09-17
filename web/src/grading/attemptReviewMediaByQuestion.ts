// Группировка видео попытки по вопросу (ADR-0037) — карточка проверки
// показывает запись под строкой своего вопроса, а не одним общим блоком под
// всеми вопросами, как было устроено видео попытки раньше (ADR-0023): иначе
// учитель не отличает, какая запись отвечает на какой видео-вопрос, когда их
// в форме несколько.
//
// На вход — не только записи, но и вопросы снимка попытки: одного itemId
// мало, чтобы доверять записи молча. Запись без itemId (старый инстанс успел
// принять её без вопроса на стыке деплоя, ADR-0037 «Последствия») и запись,
// чей itemId не указывает на видео-вопрос этого снимка, — обе идут в
// unassigned: причина показа одна для обоих случаев — учителю важно не то,
// какая именно, а что запись не потеряна (AttemptReviewAnswers.tsx).
import type { AttemptReviewQuestionDto, ExamMediaDto } from '@xuanxue/shared';

export interface AttemptReviewMediaGroups {
  /** Записи вопроса по его itemId — ключи только видео-вопросов снимка. */
  byItemId: ReadonlyMap<string, ExamMediaDto[]>;
  /** Без вопроса: itemId нет вовсе или он не о видео-вопросе этого снимка. */
  unassigned: ExamMediaDto[];
}

export function attemptReviewMediaByQuestion(
  media: readonly ExamMediaDto[],
  questions: readonly Pick<AttemptReviewQuestionDto, 'itemId' | 'kind'>[],
): AttemptReviewMediaGroups {
  const videoItemIds = new Set(
    questions.filter((question) => question.kind === 'video').map((q) => q.itemId),
  );

  const byItemId = new Map<string, ExamMediaDto[]>();
  const unassigned: ExamMediaDto[] = [];

  for (const item of media) {
    if (!item.itemId || !videoItemIds.has(item.itemId)) {
      unassigned.push(item);
      continue;
    }
    const group = byItemId.get(item.itemId);
    if (group) {
      group.push(item);
    } else {
      byItemId.set(item.itemId, [item]);
    }
  }

  return { byItemId, unassigned };
}
