// Общие помощники e2e профилей cookie (ADR-0183) — session-profile-production и
// session-profile-staging. Профили живут в разных файлах: ConfigModule читает
// env один раз при первом импорте AppModule, и второе приложение в том же
// файле получило бы профиль первого.
import request from 'supertest';
import { TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID, type TestApp } from './create-app';
import { freshIp, telegramLoginBody } from './telegram-widget-fixtures';

type Server = ReturnType<TestApp['app']['getHttpServer']>;

/** Уборка прежней host-only `session` в профилях прода и стейджинга. */
export const LEGACY_EXPIRATION =
  'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure';

export function setCookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

/** Бутстрап-админ входит без приглашения — у каждого файла своя база. */
export function loginWithTelegram(server: Server): request.Test {
  return request(server)
    .post('/api/auth/telegram')
    .set('x-requested-with', 'fetch')
    .set('x-forwarded-for', freshIp())
    .send(telegramLoginBody({ id: TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID }));
}

export function logout(server: Server): request.Test {
  return request(server).post('/api/auth/logout').set('x-requested-with', 'fetch');
}
