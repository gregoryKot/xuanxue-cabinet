// Отказ отправки из-за пропущенного объяснения (ADR-0146, ТЗ 4.4 доп.) —
// чистая функция без DOM (CLAUDE.md «Тесты»): кабинет ловит то же самое
// правило, что и сервер (assertReasonsGiven, exam-attempt-submit-reason.ts),
// до сетевого запроса, а не после отказа 400. Отдельным файлом от
// attemptUnanswered.ts: то правило — мягкое предупреждение (отправить всё
// равно можно), это — жёсткий отказ, как на сервере.
import {
  findMissingReasonNumbers,
  formatMissingReasonMessage,
  type AttemptAnswerDto,
  type AttemptBlockDto,
} from '@xuanxue/shared';

/** Ответ попытки берём функцией, а не готовым списком — по той же причине,
 * что и в attemptUnanswered.ts: на форме он живёт в ref автосохранения
 * (useAttemptAutosave.ts). */
export function checkMissingReasons(
  blocks: readonly AttemptBlockDto[],
  getAnswer: (itemId: string) => AttemptAnswerDto | undefined,
): string | null {
  const answers = blocks
    .flatMap((block) => block.questions)
    .map((question) => getAnswer(question.itemId))
    .filter((answer): answer is AttemptAnswerDto => answer !== undefined);
  const numbers = findMissingReasonNumbers(blocks, answers);
  return numbers.length > 0 ? formatMissingReasonMessage(numbers) : null;
}
