// e2e привязки Google к уже вошедшему человеку из профиля (ADR-0145) —
// отдельный файл от google-auth.e2e-spec.ts (два createTestApp() c
// MongoMemoryServer в одном файле друг за другом оказались ненадёжны в этой
// среде: второй beforeAll падал на ECONNREFUSED — та же причина, по которой
// другие домены (auth-telegram-invite*.e2e-spec.ts) разводят сценарии по
// файлам, не по describe). `start?intent=link` читает сессию самого
// запроса, `POST /auth/google` — тот же эндпоинт, что у входа: намерение
// лежит в cookie google_oauth, не в адресе (страница `/login/google` одна
// на оба случая).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { MeDto } from '@xuanxue/shared';
import { UserRecord } from '../src/users/user.schema';
import { GoogleTokenClient } from '../src/auth/google-token-client';
import { readGoogleOAuthCookie } from '../src/auth/google-oauth-cookie';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const GOOGLE_CLIENT_ID = 'e2e-link-client.apps.googleusercontent.com';

function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

/** Достаёт `Set-Cookie: google_oauth=…` из ответа — бросает явно, если её
 * нет, вместо `!` (CLAUDE.md: non-null assertion — предупреждение). */
function googleCookieFrom(res: request.Response): string {
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const found = setCookie.find((c) => c.startsWith('google_oauth='));
  if (!found) throw new Error('google_oauth cookie не найдена в ответе start');
  return found;
}

describe('Google link (e2e), intent=link', () => {
  let testApp: TestApp;
  let nextIdToken: string | null = null;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    testApp.app.getHttpServer();
  const userModel = (): Model<UserRecord> =>
    testApp.app.get(getModelToken(UserRecord.name), { strict: false });

  beforeAll(async () => {
    testApp = await createTestApp(
      (builder) => {
        builder.overrideProvider(GoogleTokenClient).useValue({
          exchange: () => Promise.resolve(nextIdToken),
        });
      },
      {
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: 'e2e-link-secret-value-long-enough',
      },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  /** `start?intent=link` сессией `sessionCookie`, затем `POST /auth/google`
   * с обоими cookie в одном заголовке (как шлёт браузер) — `postCookie`
   * заменяет `session`, если тест проверяет несовпадение сессий. */
  async function linkFlow(
    sessionCookie: string,
    sub: string,
    postCookie: string = sessionCookie,
  ): Promise<{ start: request.Response; login: request.Response }> {
    const start = await request(server())
      .get('/api/auth/google/start?intent=link')
      .set('Cookie', sessionCookie);
    const googleCookie = googleCookieFrom(start);
    const stored = readGoogleOAuthCookie(googleCookie);
    if (!stored) throw new Error('google_oauth cookie не разбирается');

    nextIdToken = jwt({
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      sub,
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: stored.nonce,
    });

    const login = await withCsrf(request(server()).post('/api/auth/google'))
      .set('Cookie', `${postCookie}; ${googleCookie}`)
      .send({ code: 'authorization-code-value', state: stored.state });

    return { start, login };
  }

  it('start?intent=link без сессии — 302 на /login, google_oauth не ставится', async () => {
    const res = await request(server()).get('/api/auth/google/start?intent=link');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/login');
    const setCookie =
      (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(setCookie.some((c) => c.startsWith('google_oauth='))).toBe(false);
  });

  it('start?intent=link с сессией — 302 на Google, cookie несёт intent/userId', async () => {
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Анна',
      roles: ['teacher'],
    });

    const res = await request(server())
      .get('/api/auth/google/start?intent=link')
      .set('Cookie', cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    const googleCookie = googleCookieFrom(res);
    const stored = readGoogleOAuthCookie(googleCookie);
    expect(stored?.intent).toBe('link');
    expect(stored?.userId).toBe(userId);
    expect(stored?.join).toBeUndefined();
  });

  it('успешная привязка — 200, googleLinked: true, без нового Set-Cookie сессии', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Анна',
      roles: ['teacher'],
    });

    const { login } = await linkFlow(cookie, 'sub-link-ok');

    expect(login.status).toBe(200);
    expect((login.body as MeDto).googleLinked).toBe(true);
    const setCookie =
      (login.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(setCookie.some((c) => c.startsWith('session='))).toBe(false);
    expect(setCookie.some((c) => c.startsWith('google_oauth=;'))).toBe(true);
  });

  it('этот Google уже принадлежит другому аккаунту — 409, ничего не меняется', async () => {
    await userModel().create({
      name: 'Пётр',
      googleId: 'sub-taken-by-peter',
      roles: [],
      status: 'active',
    });
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Анна',
      roles: ['teacher'],
    });

    const { login } = await linkFlow(cookie, 'sub-taken-by-peter');

    expect(login.status).toBe(409);
    const mine = await userModel().findById(userId).lean();
    expect(mine?.googleId).toBeUndefined();
  });

  it('cookie привязки несёт сессию другого человека — 401, ничего не меняется', async () => {
    const owner = await createUserWithSession(testApp.app, {
      name: 'Анна',
      roles: ['teacher'],
    });
    const impostor = await createUserWithSession(testApp.app, {
      name: 'Другой',
      roles: [],
    });

    const { login } = await linkFlow(owner.cookie, 'sub-mismatch', impostor.cookie);

    expect(login.status).toBe(401);
    const ownerDoc = await userModel().findById(owner.userId).lean();
    const impostorDoc = await userModel().findById(impostor.userId).lean();
    expect(ownerDoc?.googleId).toBeUndefined();
    expect(impostorDoc?.googleId).toBeUndefined();
  });
});
