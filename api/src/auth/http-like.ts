// Минимальные интерфейсы вместо @types/express (которого нет в зависимостях
// api/ — тот же приём, что в domain-exception.filter.ts): гварду и
// AuthController нужны только метод, заголовки, req.user, req.body и
// res.setHeader.
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
