// Чистые помощники email-login-token.service.ts — вынесены отдельно, чтобы
// сам сервис не перевалил за 150 строк файлового храповика (CLAUDE.md
// «Храповики»). Ни Mongo, ни DI здесь нет — юнит-тест без обвязки.
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { EMAIL_LOGIN_CODE_LENGTH } from '@xuanxue/shared';

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

// randomInt, не Math.random (SECURITY §2) — криптографически случайный
// диапазон [0, 10^EMAIL_LOGIN_CODE_LENGTH), лидирующие нули добивает padStart.
export function generateEmailLoginCode(): string {
  return String(randomInt(0, 10 ** EMAIL_LOGIN_CODE_LENGTH)).padStart(
    EMAIL_LOGIN_CODE_LENGTH,
    '0',
  );
}

// timingSafeEqual бросает исключение при разной длине буферов — длину
// проверяем сами до сравнения (SECURITY §2), а не ловим исключение.
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
