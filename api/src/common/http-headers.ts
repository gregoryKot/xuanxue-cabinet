// Минимальные интерфейсы вместо @types/express (которого нет в зависимостях
// api/ — тот же приём, что в domain-exception.filter.ts) и общий хелпер
// заголовков — раньше RequestLike/ResponseLike жили в auth/http-like.ts, но
// понадобились и вебхуку бота (telegram-webhook.guard.ts), общий common/ —
// не auth-специфичный домен.
import type { UserLean } from '../users/users.service';

export interface RequestLike {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  user?: UserLean;
  // Сырое тело запроса — ValidationPipe с `transform: true` строит из него
  // типизированный параметр @Body(), но само `req.body` не трогает
  // (whitelist/transform применяются только к возвращаемому пайпом значению).
  // Нужно проверке подписи Telegram: она считает data-check-string по ВСЕМ
  // полям, которые прислал клиент, а не только по тем, что есть в DTO
  // (telegram-login.ts).
  body?: Record<string, unknown>;
}

export interface ResponseLike {
  // Только замена заголовка, не append — Set-Cookie здесь всегда один
  // (сессия или её очистка), второй одноимённый заголовок не нужен.
  setHeader(name: string, value: string): unknown;
}

// Node склеивает дублирующиеся заголовки одной строкой через запятую (кроме
// set-cookie, который сюда не попадает) — значение здесь никогда не массив
// на практике, но тип из RequestLike этого не гарантирует. Общий хелпер —
// auth.guard.ts (cookie) и telegram-webhook.guard.ts (secret_token) читали
// его каждый по-своему (CLAUDE.md «Дубли и мёртвый код»).
export function asSingleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
