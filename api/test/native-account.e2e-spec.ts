// e2e нативного входа Daychi на настоящем AppModule (ADR-0181, профиль Workshop
// 3c98d4a): GET /api/auth/native/me и граница bearer (N13, N17). Доступы выдаёт
// сервис напрямую — маршрут обмена кода приедет следующим PR. Владение: bearer А
// не открывает данные Б, cookie сессии не заменяет bearer и ответ не меняет,
// bearer не открывает ни одного маршрута кабинета. Продление, отзыв и троттлинг —
// соседними native-*.e2e-spec.ts, разбор профиля — native-account-parity.
import { DateTime } from 'luxon';
import request from 'supertest';
import { type NativeAccountResponse } from '@xuanxue/shared';
import { createUserWithSession } from './e2e-support/session';
import {
  LIFETIME,
  NATIVE_BASE,
  THRESHOLD,
  T0,
  bearer,
  expectNativeHeaders,
  expectOnlyError,
  issueNativeGrant,
  pinTime,
  useNativeApi,
} from './e2e-support/native-fixtures';

describe('нативный вход Daychi: me и граница bearer (e2e)', () => {
  const api = useNativeApi();
  const { app, server, me, person } = api;

  describe('GET me', () => {
    it('отдаёт аккаунт владельца и сроки присланного bearer, с no-store и без cookie', async () => {
      pinTime(T0);
      const a = await person('Мария');
      const b = await person('Борис');

      const res = await me(a.token);

      expect(res.status).toBe(200);
      const body = res.body as NativeAccountResponse;
      expect(body.account).toMatchObject({ id: a.userId, name: 'Мария' });
      expect(body.session).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{24}$/) as string,
        expires_in: LIFETIME,
        renew_after: THRESHOLD + 1,
      });
      expectNativeHeaders(res);
      expect(((await me(b.token)).body as NativeAccountResponse).account.id).toBe(
        b.userId,
      );
    });

    it('N13: cookie браузера без bearer — 401 invalid_token с WWW-Authenticate', async () => {
      const { cookie } = await createUserWithSession(app(), {
        name: 'Вошла',
        roles: [],
      });

      const res = await request(server()).get(`${NATIVE_BASE}/me`).set('Cookie', cookie);

      expectOnlyError(res, 401, 'invalid_token');
      expect(res.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    });

    it('валидная cookie рядом с негодным bearer ничего не меняет, а cookie не перевыпускается', async () => {
      const { cookie, userId } = await createUserWithSession(app(), {
        name: 'Вошла',
        roles: [],
        issuedAt: DateTime.utc().minus({ days: 30 }),
      });
      const { access_token: token } = await issueNativeGrant(app(), userId);

      const refused = await request(server())
        .get(`${NATIVE_BASE}/me`)
        .set('Cookie', cookie)
        .set('Authorization', bearer('z'.repeat(43)));
      const accepted = await request(server())
        .get(`${NATIVE_BASE}/me`)
        .set('Cookie', cookie)
        .set('Authorization', bearer(token));

      expectOnlyError(refused, 401, 'invalid_token');
      expect(accepted.status).toBe(200);
      expectNativeHeaders(accepted);
    });

    it.each([
      ['другая схема', (token: string) => `Basic ${token}`],
      ['токен не нашего формата', () => 'Bearer not-a-native-token'],
      ['токен незнакомый', () => `Bearer ${'q'.repeat(43)}`],
    ])('%s — 401 invalid_token', async (_name, header) => {
      const { token } = await person();

      const res = await request(server())
        .get(`${NATIVE_BASE}/me`)
        .set('Authorization', header(token));

      expectOnlyError(res, 401, 'invalid_token');
      expect(res.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    });

    it('N08: за секунду до срока — 200, в секунду срока — 401', async () => {
      pinTime(T0);
      const { token } = await person();

      pinTime(T0.plus({ seconds: LIFETIME - 1 }));
      const last = await me(token);
      pinTime(T0.plus({ seconds: LIFETIME }));
      const expired = await me(token);

      expect(last.status).toBe(200);
      expect((last.body as NativeAccountResponse).session.expires_in).toBe(1);
      expectOnlyError(expired, 401, 'invalid_token');
    });

    it('N13: заблокированный — 403 account_blocked без WWW-Authenticate, после разблокировки 200', async () => {
      const { userId, token } = await person();
      const users = api.users();

      await users.updateOne({ _id: userId }, { status: 'blocked' });
      const blocked = await me(token);
      const garbage = await me('w'.repeat(43));
      await users.updateOne({ _id: userId }, { status: 'active' });
      const restored = await me(token);

      expectOnlyError(blocked, 403, 'account_blocked');
      expect(blocked.headers['www-authenticate']).toBeUndefined();
      expectOnlyError(garbage, 401, 'invalid_token');
      expect(restored.status).toBe(200);
    });

    it('N13: удалённый человек — 401 invalid_token', async () => {
      const { userId, token } = await person();
      const users = api.users();

      await users.deleteOne({ _id: userId });

      expectOnlyError(await me(token), 401, 'invalid_token');
    });

    it('любой query-параметр — 400 invalid_request', async () => {
      const { token } = await person();

      const res = await me(token).query({ a: '1' });

      expectOnlyError(res, 400, 'invalid_request');
    });
  });

  describe('N17: bearer не открывает ничего, кроме me/renew/revoke', () => {
    it('на GET /api/auth/me и на маршруте штата — 401 конверт кабинета, не данные', async () => {
      const { userId } = await createUserWithSession(app(), {
        name: 'Мария',
        roles: ['admin'],
      });
      const { access_token: token } = await issueNativeGrant(app(), userId);

      const profile = await request(server())
        .get('/api/auth/me')
        .set('Authorization', bearer(token));
      const staff = await request(server())
        .get('/api/classes')
        .set('Authorization', bearer(token));

      expect(profile.status).toBe(401);
      expect(staff.status).toBe(401);
      expect(profile.body).toMatchObject({ code: 'unauthorized' });
    });

    it('cookie сессии вместо bearer на renew — 401, а не продление', async () => {
      const { cookie } = await createUserWithSession(app(), {
        name: 'Вошла',
        roles: [],
      });

      const res = await request(server())
        .post(`${NATIVE_BASE}/renew`)
        .set('Cookie', cookie)
        .send({});

      expectOnlyError(res, 401, 'invalid_token');
    });
  });
});
