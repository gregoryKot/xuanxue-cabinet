// Deep link «Отправить видео боту» (ADR-0023): t.me/<имя>?start=exam_<id> —
// Telegram сам открывает чат с ботом и передаёт payload `exam_<id>` в
// /start, бот берёт attemptId оттуда (api/src/telegram/handlers/
// exam-media-message.handler.ts). Имя бота приходит из `GET /auth/config`
// (`telegramBotUsername`) и может отсутствовать — бот не ответил на getMe
// при старте (api/src/telegram/telegram-bot.service.ts, botUsername()) —
// тогда AttemptMediaPrompt.tsx эту функцию просто не зовёт: подставлять
// «undefined» в адрес нельзя.
export function buildExamMediaTelegramLink(
  telegramBotUsername: string,
  attemptId: string,
): string {
  return `https://t.me/${telegramBotUsername}?start=exam_${encodeURIComponent(attemptId)}`;
}
