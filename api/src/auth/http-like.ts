// Минимальные интерфейсы вместо @types/express (которого нет в зависимостях
// api/ — тот же приём, что в domain-exception.filter.ts): гварду и
// AuthController нужны только метод, заголовки, req.user и res.setHeader.
import type { UserLean } from '../users/users.service';

export interface RequestLike {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  user?: UserLean;
}

export interface ResponseLike {
  // Только замена заголовка, не append — Set-Cookie здесь всегда один
  // (сессия или её очистка), второй одноимённый заголовок не нужен.
  setHeader(name: string, value: string): unknown;
}
