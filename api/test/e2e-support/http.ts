// Общие HTTP-хелперы e2e (CLAUDE.md «одна механика — один компонент») —
// раньше copy-paste жил в каждом *.e2e-spec.ts отдельно.
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { UserRole } from '@xuanxue/shared';
import { createUserWithSession } from './session';

/** Мутирующий запрос (POST/PATCH/PUT/DELETE) без этого заголовка получает 403
 * от CSRF-гварда, кроме `@SkipCsrf()` (SECURITY §2). */
export function withCsrf(req: request.Test): request.Test {
  return req.set('x-requested-with', 'fetch');
}

/** Cookie сессии с заданными ролями — обёртка над `createUserWithSession` для
 * тестов на роль/доступ, которым не нужен сам `userId`. */
export async function sessionCookieFor(
  app: NestExpressApplication,
  roles: UserRole[],
): Promise<string> {
  const { cookie } = await createUserWithSession(app, { name: 'Тест', roles });
  return cookie;
}
