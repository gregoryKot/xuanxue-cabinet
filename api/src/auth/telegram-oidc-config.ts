// Проверка «Telegram-вход по OpenID Connect доступен конфигурацией» (ADR-0187):
// три значения разом — BOT_TOKEN (числовой id бота = client_id),
// TELEGRAM_LOGIN_CLIENT_SECRET (BotFather → бот → «Login Widget» → Client
// Secret) и PUBLIC_URL (адрес возврата). Нужны и TelegramOidcService (start,
// обмен кода), и GET /auth/config (какую кнопку показать) — одна функция на
// оба места (CLAUDE.md «Дубли»), тот же приём, что у googleOAuthConfig.
import type { ConfigService } from '@nestjs/config';
import { TELEGRAM_LOGIN_CALLBACK_PATH } from '@xuanxue/shared';
import { botIdFromToken } from './bot-id-from-token';

export interface TelegramOidcConfig {
  /** Числовой id бота строкой — он же `aud` в id_token. */
  clientId: string;
  clientSecret: string;
  /** `${PUBLIC_URL}/login/telegram` — записан в BotFather («Allowed URLs»). */
  redirectUri: string;
}

/** `null`, если хоть одного значения нет: пока секрет не заведён, кабинет
 * остаётся на прежнем переходе с `#tgAuthResult` (ADR-0028) — деплой без
 * настройки BotFather не отключает Telegram-вход совсем. Какой ошибкой
 * ответить на `null`, решает вызывающий код. */
export function telegramOidcConfig(config: ConfigService): TelegramOidcConfig | null {
  const botId = botIdFromToken(config.get<string>('BOT_TOKEN'));
  const clientSecret = config.get<string>('TELEGRAM_LOGIN_CLIENT_SECRET');
  const publicUrl = config.get<string>('PUBLIC_URL');
  if (!botId || !clientSecret || !publicUrl) return null;
  return {
    clientId: String(botId),
    clientSecret,
    redirectUri: `${publicUrl}${TELEGRAM_LOGIN_CALLBACK_PATH}`,
  };
}
