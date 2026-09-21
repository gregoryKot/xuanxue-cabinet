// Обход снимка попытки по itemId (ADR-0037) — общий для двух проверок.
// isVideoItemInSnapshot: перед привязкой видео/ссылки — itemId обязан
// встретиться в снимке и быть вопросом типа video, иначе видео пришло бы
// неизвестно к чему или подменяло бы ответ на текстовый вопрос/вопрос с
// вариантами. findQuestionInSnapshot: номер и формулировка вопроса для
// уведомления о привязанной ссылке (ADR-0084, notify-link-attached.ts) — тот
// же сквозной порядок, что flattenAttemptQuestions в telegram-хендлерах
// (exam-question-screen.ts), только над снимком в форме схемы
// (AttemptBlockRecord), не DTO, поэтому не переиспользован напрямую, а обход
// вынесен сюда один раз, не переписан заново в третьем месте. Чистые функции
// без Mongo (CLAUDE.md «Тесты»), вызываются только из MediaAssetsService.
import type {
  AttemptBlockRecord,
  AttemptQuestionRecord,
} from '../exams/exam-attempt.schema';

function flattenQuestions(
  blocks: readonly AttemptBlockRecord[],
): AttemptQuestionRecord[] {
  return blocks.flatMap((block) => block.questions);
}

export function isVideoItemInSnapshot(
  blocks: readonly AttemptBlockRecord[],
  itemId: string,
): boolean {
  return flattenQuestions(blocks).some(
    (question) => question.itemId === itemId && question.kind === 'video',
  );
}

export interface QuestionInSnapshot {
  question: AttemptQuestionRecord;
  /** Номер по сквозному порядку, 1-based — как «Вопрос N из M» на экране
   * бота (flattenAttemptQuestions, exam-question-screen.ts). */
  order: number;
}

/** itemId, которого нет в снимке, — `null`, не исключение: в норме сюда
 * попадает уже проверенный isVideoItemInSnapshot id (addLink), но функция не
 * полагается на это и не падает сама. */
export function findQuestionInSnapshot(
  blocks: readonly AttemptBlockRecord[],
  itemId: string,
): QuestionInSnapshot | null {
  for (const [index, question] of flattenQuestions(blocks).entries()) {
    if (question.itemId === itemId) return { question, order: index + 1 };
  }
  return null;
}
