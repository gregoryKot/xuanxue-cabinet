// Тексты бота для проверки экзамена (ТЗ 4б.5, PLAN §12) — в одном месте,
// чтобы одно и то же событие звучало одинаково из кнопки и из текстового
// сообщения (message.handler.ts, grade-callback.handler.ts,
// grade-comment.handler.ts) — CLAUDE.md «Одна механика — один компонент».
// SECURITY §3: чужой/неизвестный attemptId получает отказ без объяснения
// причин — этот текст не говорит, чья это работа и почему её не открыть.
export const GRADE_ATTEMPT_NOT_FOUND_MESSAGE =
  'Работа не найдена — возможно, её уже удалили.';
export const GRADE_COMMENT_PROMPT =
  'Напишите комментарий одним сообщением — или нажмите «Без комментария».';
export const GRADE_COMMENT_CANCELLED_MESSAGE = 'Отменено. Оценка не сохранена.';
export const GRADE_COMMENT_EXPIRED_MESSAGE =
  'Ожидание комментария истекло. Откройте работу заново: команда /проверка в боте.';
export const GRADE_NOT_TEXT_MESSAGE =
  'Комментарий — текстом, обычным сообщением. Или нажмите «Без комментария».';
