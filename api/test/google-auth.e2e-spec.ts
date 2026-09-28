// e2e входа через Google (ADR-0145) — настоящий AppModule на
// MongoMemoryServer, GoogleTokenClient подменён фейком: реальный Google в CI
// недоступен, фейк отдаёт самодельный id_token (та же схема, что
// fake-mail-service.ts у email-входа) с claims, которые задаёт тест.
// GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — через envOverrides (PUBLIC_URL уже
// стоит в setTestEnv(), create-app.ts).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, InviteLinkDto, MeDto } from '@xuanxue/shared';
import { UserRecord } from '../src/users/user.schema';
import { GoogleTokenClient } from '../src/auth/google-token-client';
import { readGoogleOAuthCookie } from '../src/auth/google-oauth-cookie';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const GOOGLE_CLIENT_ID = 'e2e-client.apps.googleusercontent.com';

function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

/** Достаёт `Set-Cookie: google_oauth=…` из ответа `start` — бросает явно,
 * если её нет, вместо `!` (CLAUDE.md: non-null assertion — предупреждение). */
function googleCookieFrom(res: request.Response): string {
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const found = setCookie.find((c) => c.startsWith('google_oauth='));
  if (!found) throw new Error('google_oauth cookie не найдена в ответе start');
  return found;
}

describe('Google login (e2e)', () => {
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
        GOOGLE_CLIENT_SECRET: 'e2e-secret-value-long-enough',
      },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  /** Проходит `GET /auth/google/start`, достаёт state/nonce из
   * `Set-Cookie: google_oauth`, кладёт в `nextIdToken` JWT с этими же claims
   * и телом отвечает на `POST /auth/google` — воспроизводит реальный поток
   * без браузера и без сети. */
  async function loginFlow(
    claimsOverrides: Record<string, unknown>,
    join?: string,
  ): Promise<{ start: request.Response; login: request.Response }> {
    const query = join ? `?join=${join}` : '';
    const start = await request(server()).get(`/api/auth/google/start${query}`);
    const googleCookie = googleCookieFrom(start);
    const stored = readGoogleOAuthCookie(googleCookie);
    if (!stored) throw new Error('google_oauth cookie не разбирается');

    nextIdToken = jwt({
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      sub: 'e2e-sub',
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: stored.nonce,
      ...claimsOverrides,
    });

    const login = await withCsrf(request(server()).post('/api/auth/google'))
      .set('Cookie', googleCookie)
      .send({ code: 'authorization-code-value', state: stored.state });

    return { start, login };
  }

  it('GET /auth/google/start — 302 на Google, S256, Set-Cookie google_oauth', async () => {
    const res = await request(server()).get('/api/auth/google/start');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(res.headers.location).toContain('code_challenge_method=S256');
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith('google_oauth='))).toBe(true);
  });

  it('POST /auth/google без cookie — 401', async () => {
    const res = await withCsrf(request(server()).post('/api/auth/google')).send({
      code: 'x'.repeat(20),
      state: 'a'.repeat(43),
    });

    expect(res.status).toBe(401);
  });

  it('POST /auth/google с неверным state — 401', async () => {
    const start = await request(server()).get('/api/auth/google/start');
    const googleCookie = googleCookieFrom(start);

    const res = await withCsrf(request(server()).post('/api/auth/google'))
      .set('Cookie', googleCookie)
      .send({ code: 'x'.repeat(20), state: 'b'.repeat(43) });

    expect(res.status).toBe(401);
  });

  it('POST /auth/google без x-requested-with — 403 (CSRF)', async () => {
    const start = await request(server()).get('/api/auth/google/start');
    const googleCookie = googleCookieFrom(start);

    const res = await request(server())
      .post('/api/auth/google')
      .set('Cookie', googleCookie)
      .send({ code: 'x'.repeat(20), state: 'a'.repeat(43) });

    expect(res.status).toBe(403);
  });

  it('существующий email-пользователь (Gmail) — 200, сессия, googleId привязан', async () => {
    const existing = await userModel().create({
      name: 'Анна',
      email: 'anna@gmail.com',
      roles: ['teacher'],
      status: 'active',
    });

    const { login } = await loginFlow({
      email: 'anna@gmail.com',
      email_verified: true,
    });

    expect(login.status).toBe(200);
    const setCookie = login.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith('session='))).toBe(true);
    expect((login.body as MeDto).id).toBe(existing._id.toString());

    const reread = await userModel().findById(existing._id).lean();
    expect(reread?.googleId).toBe('e2e-sub');
  });

  it('новый человек без приглашения — 403, аккаунт не создаётся', async () => {
    const { login } = await loginFlow({ sub: 'new-no-invite' });

    expect(login.status).toBe(403);
    expect(await userModel().countDocuments({ googleId: 'new-no-invite' })).toBe(0);
  });

  it('новый человек с валидным join — 200, аккаунт создаётся', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const inviteRes = await withCsrf(
      request(server()).post('/api/users/invite-link'),
    ).set('Cookie', adminCookie);
    const url = (inviteRes.body as InviteLinkDto).url as string;
    const code = url.split('/join/')[1] as string;

    const { login } = await loginFlow({ sub: 'new-with-invite' }, code);

    expect(login.status).toBe(200);
    expect(await userModel().countDocuments({ googleId: 'new-with-invite' })).toBe(1);
  });

  it('заблокированный пользователь — 403', async () => {
    await userModel().create({
      name: 'Бывший',
      email: 'blocked@gmail.com',
      roles: [],
      status: 'blocked',
    });

    const { login } = await loginFlow({
      sub: 'sub-blocked',
      email: 'blocked@gmail.com',
      email_verified: true,
    });

    expect(login.status).toBe(403);
    expect((login.body as ApiErrorBody).message).toBeDefined();
  });
});
