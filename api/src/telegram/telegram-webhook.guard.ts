// Проверка вебхука Telegram (SECURITY §2, ADR-0015): заголовок
// x-telegram-bot-api-secret-token сверяется с TELEGRAM_WEBHOOK_SECRET через
// timingSafeEqual (SECURITY §8 — не `===`). BOT_TOKEN или
// TELEGRAM_WEBHOOK_SECRET не заданы в env — бот выключен для всех (503, как
// вход через Telegram без BOT_TOKEN, telegram-auth.service.ts): без токена
// бот не может ответить, без секрета вебхук нечем проверять — оба случая
// не вина клиента. Telegram ретраит апдейт при не-200 и растит
// pending_update_count в getWebhookInfo (RUNBOOK §5/§8.2) — сигнал, что
// секрет пропал из env. Секрет задан, но не совпал — 403 (запрос не от
// нашего вебхука).
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { ForbiddenError, NotAvailableError } from '../common/errors';
import { asSingleHeader, type RequestLike } from '../common/http-headers';

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const NOT_AVAILABLE_MESSAGE = 'Бот Telegram пока не подключён.';
const FORBIDDEN_MESSAGE = 'Запрос отклонён.';

@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    const botToken = this.config.get<string>('BOT_TOKEN');
    if (!secret || !botToken) throw new NotAvailableError(NOT_AVAILABLE_MESSAGE);

    const request = context.switchToHttp().getRequest<RequestLike>();
    const provided = asSingleHeader(request.headers[TELEGRAM_SECRET_HEADER]);
    if (!matchesSecret(provided, secret)) throw new ForbiddenError(FORBIDDEN_MESSAGE);
    return true;
  }
}

// Длины сравниваем до timingSafeEqual — сам он иначе бросает исключение
// вместо false (SECURITY §2).
function matchesSecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  return (
    providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf)
  );
}
