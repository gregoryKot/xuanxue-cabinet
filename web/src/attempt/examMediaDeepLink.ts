// Deep link «Отправить видео боту» (ADR-0023, ADR-0037): t.me/<имя>?start=
// exam_<attemptId>_<itemId> — Telegram сам открывает чат с ботом и передаёт
// payload в /start, бот берёт attemptId и itemId оттуда
// (api/src/telegram/handlers/start-payload.ts): видео — ответ на конкретный
// вопрос попытки, не вложение к ней целиком, поэтому вопрос — часть ссылки,
// а не только попытка. Имя бота приходит из `GET /auth/config`
// (`telegramBotUsername`) и может отсутствовать — бот не ответил на getMe
// при старте (api/src/telegram/telegram-bot.service.ts, botUsername()) —
// тогда AttemptQuestionVideo.tsx эту функцию просто не зовёт: подставлять
// «undefined» в адрес нельзя.
export function buildExamMediaTelegramLink(
  telegramBotUsername: string,
  attemptId: string,
  itemId: string,
): string {
  const encodedAttemptId = encodeURIComponent(attemptId);
  const encodedItemId = encodeURIComponent(itemId);
  return `https://t.me/${telegramBotUsername}?start=exam_${encodedAttemptId}_${encodedItemId}`;
}
