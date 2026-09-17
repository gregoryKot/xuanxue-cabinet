// Проверка перед привязкой видео к конкретному вопросу (ADR-0037): itemId
// обязан встретиться в снимке попытки и быть вопросом типа video — иначе
// видео пришло бы неизвестно к чему или подменяло бы ответ на текстовый
// вопрос/вопрос с вариантами. Чистая функция без Mongo (CLAUDE.md «Тесты»),
// тот же приём, что assertAnswersKnown (exams/exam-attempt-answers.ts) —
// вынесена сюда отдельным файлом, а не туда: чужой домен (media, не exams),
// вызывается только из MediaAssetsService.
import type { AttemptBlockRecord } from '../exams/exam-attempt.schema';

export function isVideoItemInSnapshot(
  blocks: readonly AttemptBlockRecord[],
  itemId: string,
): boolean {
  return blocks
    .flatMap((block) => block.questions)
    .some((question) => question.itemId === itemId && question.kind === 'video');
}
