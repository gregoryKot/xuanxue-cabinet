// Проверка перед привязкой видео к конкретному вопросу (ADR-0037): itemId
// обязан встретиться в снимке попытки и быть вопросом типа video — иначе
// видео пришло бы неизвестно к чему или подменяло бы ответ на текстовый
// вопрос/вопрос с вариантами. Чистая функция без Mongo (CLAUDE.md «Тесты»),
// тот же приём, что assertAnswersKnown (exams/exam-attempt-answers.ts) —
// вынесена сюда отдельным файлом, а не туда: чужой домен (media, не exams),
// вызывается только из MediaAssetsService.
//
// videoQuestionPromptInSnapshot — формулировка video-вопроса для уведомления
// учителю о присланной ссылке (exam-media-notifier.port.ts, «какой вопрос»).
// Именно формулировка, а не номер: номера у вопроса три разных — карточка
// проверки считает все вопросы внутри своего блока (web QuestionRow),
// сводка бота — сквозным счётом по всей попытке
// (attempt-answers-summary.ts), а видео-вопросов в форме бывает несколько
// (ADR-0037). Любой номер в письме учителю разошёлся бы с тем, что он видит
// на экране; формулировка совпадает всегда. isVideoItemInSnapshot выражена
// через неё же, не через отдельный проход по блокам — два похожих обхода
// одного снимка ловил бы jscpd-храповик (CLAUDE.md «Храповики»).
import type { AttemptBlockRecord } from '../exams/exam-attempt.schema';

export function videoQuestionPromptInSnapshot(
  blocks: readonly AttemptBlockRecord[],
  itemId: string | undefined,
): string | null {
  if (!itemId) return null;
  const found = blocks
    .flatMap((block) => block.questions)
    .find((question) => question.itemId === itemId && question.kind === 'video');
  return found ? found.prompt : null;
}

export function isVideoItemInSnapshot(
  blocks: readonly AttemptBlockRecord[],
  itemId: string,
): boolean {
  return videoQuestionPromptInSnapshot(blocks, itemId) !== null;
}
