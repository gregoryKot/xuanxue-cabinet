// POST на token endpoint провайдера (Google — ADR-0145, Telegram — ADR-0187) и
// извлечение `id_token` из ответа. Один код на двоих: сетевая часть (таймаут,
// не-2xx, не-JSON, нет id_token) у них одинакова, различаются адрес, заголовки
// и поля формы — их собирает клиент провайдера.
import type { Logger } from '@nestjs/common';
import { errorMessage } from '../common/error-info';

// Сеть, которая не рвётся, а молчит, иначе держит запрос до таймаута
// платформы (CLAUDE.md, check-outbound-timeout.mjs).
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

export interface TokenRequest {
  /** Имя провайдера для строки лога («Google», «Telegram»). */
  provider: string;
  endpoint: string;
  /** Сверх `Content-Type: application/x-www-form-urlencoded` (его ставит сам вызов). */
  headers?: Record<string, string>;
  body: URLSearchParams;
}

/** `null` — провайдер отказал в обмене или ответ не тот, что ожидался;
 * вызывающий сервис отвечает одним текстом «не получилось войти», здесь только
 * лог с причиной. Тело ответа, код и секреты в лог не идут (SECURITY §2): в
 * теле ошибки бывает эхо client_secret или code. */
export async function requestIdToken(
  logger: Logger,
  { provider, endpoint, headers, body }: TokenRequest,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: body.toString(),
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error(`${provider} token endpoint недоступен: ${errorMessage(err)}`);
    return null;
  }

  if (!response.ok) {
    logger.error(`${provider} token endpoint ответил ${response.status}`);
    return null;
  }

  const payload = (await response.json().catch(() => null)) as {
    id_token?: unknown;
  } | null;
  if (!payload || typeof payload.id_token !== 'string') {
    logger.error(`${provider} token endpoint не вернул id_token`);
    return null;
  }
  return payload.id_token;
}
