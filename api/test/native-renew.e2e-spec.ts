// e2e POST /api/auth/native/renew (ADR-0181, N08, N09): порог возраста строго
// больше 604800 с, прежний токен живёт до своего срока, тело строго {}. Общие
// запросы и ожидания — e2e-support/native-fixtures.ts.
import request from 'supertest';
import { type NativeAccountResponse, type NativeTokenResponse } from '@xuanxue/shared';
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

describe('нативный вход Daychi: renew (e2e)', () => {
  const api = useNativeApi();
  const { app, server, me, renew, person } = api;

  describe('POST renew', () => {
    it('N08: возраст 604800 — тот же токен и renew_after 1; 604801 — новый токен того же доступа', async () => {
      pinTime(T0);
      const { token } = await person();

      pinTime(T0.plus({ seconds: THRESHOLD }));
      const early = await renew(token);
      pinTime(T0.plus({ seconds: THRESHOLD + 1 }));
      const profile = await me(token);
      const late = await renew(token);

      const earlyBody = early.body as NativeTokenResponse;
      const lateBody = late.body as NativeTokenResponse;
      expect(early.status).toBe(200);
      expectNativeHeaders(early);
      expect(earlyBody).toMatchObject({
        access_token: token,
        token_type: 'Bearer',
        scope: 'account:read',
        renew_after: 1,
        expires_in: LIFETIME - THRESHOLD,
      });
      expect((profile.body as NativeAccountResponse).session.renew_after).toBe(0);
      expect(late.status).toBe(200);
      expectNativeHeaders(late);
      expect(lateBody.access_token).not.toBe(token);
      expect(lateBody.session_id).toBe(earlyBody.session_id);
      expect(lateBody).toMatchObject({
        expires_in: LIFETIME,
        renew_after: THRESHOLD + 1,
      });
    });

    it('N09: после продления прежний и новый токен читают аккаунт, прежний может продлить снова', async () => {
      const { userId } = await createUserWithSession(app(), {
        name: 'Ученик',
        roles: [],
      });
      pinTime(T0);
      const first = await issueNativeGrant(app(), userId);
      pinTime(T0.plus({ seconds: THRESHOLD + 1 }));
      const renewed = (await renew(first.access_token)).body as NativeTokenResponse;

      const old = await me(first.access_token);
      const fresh = await me(renewed.access_token);
      const again = await renew(first.access_token);

      expect(old.status).toBe(200);
      expect(fresh.status).toBe(200);
      expect(again.status).toBe(200);
      expect((again.body as NativeTokenResponse).session_id).toBe(renewed.session_id);
    });

    it('негодный bearer — 401, заблокированный — 403', async () => {
      const { userId, token } = await person();
      const users = api.users();

      const garbage = await renew('k'.repeat(43));
      await users.updateOne({ _id: userId }, { status: 'blocked' });
      const blocked = await renew(token);

      expectOnlyError(garbage, 401, 'invalid_token');
      expectOnlyError(blocked, 403, 'account_blocked');
    });

    it.each([
      ['массив', (req: request.Test) => req.send([])],
      ['лишнее поле', (req: request.Test) => req.send({ a: 1 })],
      ['тела нет', (req: request.Test) => req],
      ['не JSON', (req: request.Test) => req.type('text/plain').send('{}')],
      ['битый JSON', (req: request.Test) => req.type('json').send('{')],
      ['строка вместо объекта', (req: request.Test) => req.type('json').send('"x"')],
    ])('тело не {}: %s — 400 invalid_request', async (_name, withBody) => {
      const { token } = await person();

      const res = await withBody(
        request(server())
          .post(`${NATIVE_BASE}/renew`)
          .set('Authorization', bearer(token)),
      );

      expectOnlyError(res, 400, 'invalid_request');
    });

    it('после неудачного запроса токен всё ещё работает', async () => {
      const { token } = await person();

      await request(server())
        .post(`${NATIVE_BASE}/renew`)
        .set('Authorization', bearer(token))
        .send({ a: 1 });

      expect((await me(token)).status).toBe(200);
    });
  });
});
