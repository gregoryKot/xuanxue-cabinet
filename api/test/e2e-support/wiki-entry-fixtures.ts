// Общие помощники e2e входа из wiki (ADR-0183) — wiki-entry-production,
// wiki-entry-staging и wiki-entry-local. Профили живут в разных файлах:
// ConfigModule читает env один раз при первом импорте AppModule.
import request from 'supertest';
import type { TestApp } from './create-app';
import { freshIp } from './telegram-widget-fixtures';

type Server = ReturnType<TestApp['app']['getHttpServer']>;

/** Назначение `/a?x=1#top`: так его присылает wiki и так оно возвращается с
 * экрана входа кабинета (путь выписан руками — тест не берёт его из кода). */
export const ENTRY_QUERY = 'returnTo=%2Fa%3Fx%3D1%23top';
export const ENTRY_LOGIN_PATH =
  '/login?returnTo=%2Fwiki%3FreturnTo%3D%252Fa%253Fx%253D1%2523top';

/** Каждому запросу свой адрес: троттлер бакетирует неверифицированное по IP. */
export function enterWiki(
  server: Server,
  query: string | undefined,
  cookie?: string,
): request.Test {
  const req = request(server)
    .get(query === undefined ? '/wiki' : `/wiki?${query}`)
    .set('x-forwarded-for', freshIp());
  return cookie ? req.set('Cookie', cookie) : req;
}

export function expectNoStore(res: request.Response): void {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers.pragma).toBe('no-cache');
}
