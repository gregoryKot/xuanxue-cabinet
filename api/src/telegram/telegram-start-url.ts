// Ссылка на бота с payload для `/start` — `t.me/<бот>?start=<payload>`. Одна
// сборка на три места: приглашение (invite-link.service.ts), связка Telegram
// (telegram-link-code.service.ts) и напоминание об оплате
// (payments/payment-reminder-text.ts, ADR-0150) — повтор строки в трёх
// файлах ловит jscpd, а «https://t.me/» в одном месте меняется одной правкой.
// Payload вместе с префиксом (`INVITE_TELEGRAM_START_PREFIX` и подобные)
// собирает вызывающий: набор допустимых символов Telegram задаёт для
// payload, а не для ссылки.
const TELEGRAM_BOT_URL_BASE = 'https://t.me/';

export function telegramStartUrl(botUsername: string, payload: string): string {
  return `${TELEGRAM_BOT_URL_BASE}${botUsername}?start=${payload}`;
}
