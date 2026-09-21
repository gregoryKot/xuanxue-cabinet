// Текст DM учителю/помощнику «ученик привязал ссылку на видео-ответ»
// (ADR-0084 — ссылка теперь основной путь ответа на видео-вопрос, значит
// молчание о ней было тихим отказом, CLAUDE.md «Логи»). Чистая логика, без
// Mongo и DI (CLAUDE.md «Тесты»), тот же приём, что attempt-submitted-message.ts.
// Ссылку не прячем за разметку (Markdown/HTML-ссылку вида «Открыть») —
// учитель должен мочь открыть её одним взглядом на голый URL, который
// Telegram сам подсвечивает как ссылку в обычном тексте.
import type { LinkAttachedContext } from '../media/exam-media-notifier.port';

// Формулировка вопроса в одном сообщении бота — тот же приём, что
// ANSWER_PREVIEW_LENGTH (attempt-answers-summary.ts): длина под текст
// уведомления целиком, не под тесноту кнопки (там короче, new-exam-types.ts).
const QUESTION_PROMPT_PREVIEW_LENGTH = 200;

function truncatedPrompt(prompt: string): string {
  return prompt.length > QUESTION_PROMPT_PREVIEW_LENGTH
    ? `${prompt.slice(0, QUESTION_PROMPT_PREVIEW_LENGTH - 1)}…`
    : prompt;
}

export function linkAttachedMessage(
  studentName: string,
  context: LinkAttachedContext,
): string {
  // «Ссылка от {имя}», не «{имя} прислал(а)» — глагол прошедшего времени
  // потребовал бы знать пол ученика, которого в данных нет (тот же приём,
  // что attemptSubmittedMessage: «Работа от {имя}»).
  const header = `Ссылка на видео-ответ от ${studentName} — экзамен «${context.examTitle}».`;
  // itemId не пришёл (деплой на стыке expand → contract, ADR-0037
  // «Последствия») — уведомление всё равно уходит, просто без номера вопроса.
  const questionLine = context.question
    ? `Вопрос ${context.question.order}: ${truncatedPrompt(context.question.prompt)}`
    : undefined;
  const linkLine = `Ссылка: ${context.url}`;
  return [header, questionLine, linkLine]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}
