// e2e POST /api/auth/native/revoke и троттлинга нативных маршрутов (ADR-0181,
// N11, N12): отзыв идемпотентен и всегда 200 с пустым телом, форма разбирается
// строго по профилю, лимит по IP отвечает {"error":"rate_limited"}. Общие
// запросы и ожидания — e2e-support/native-fixtures.ts.
import request from 'supertest';
import { type NativeTokenResponse } from '@xuanxue/shared';
import { NATIVE_AUTH_THROTTLE } from '../src/auth/login-throttle';
import {
  FORM,
  NATIVE_BASE,
  THRESHOLD,
  T0,
  expectNativeHeaders,
  expectOnlyError,
  issueNativeGrant,
  pinTime,
  useNativeApi,
} from './e2e-support/native-fixtures';
import { freshIp } from './e2e-support/telegram-widget-fixtures';

describe('нативный вход Daychi: revoke и троттлинг (e2e)', () => {
  const api = useNativeApi();
  const { app, server, me, renew, revoke, person } = api;

  describe('POST revoke', () => {
    it('200 с пустым телом, затем me — 401; чужой доступ жив', async () => {
      const a = await person('Мария');
      const b = await person('Борис');

      const res = await revoke(a.token);

      expect(res.status).toBe(200);
      expect(res.text).toBe('');
      expectNativeHeaders(res);
      expectOnlyError(await me(a.token), 401, 'invalid_token');
      expect((await me(b.token)).status).toBe(200);
    });

    it('N11: отзыв по старому токену гасит и продлённый, второй доступ человека жив', async () => {
      pinTime(T0);
      const { userId, token: first } = await person();
      const second = await issueNativeGrant(app(), userId);
      pinTime(T0.plus({ seconds: THRESHOLD + 1 }));
      const renewed = (await renew(first)).body as NativeTokenResponse;

      await revoke(first);

      expectOnlyError(await me(first), 401, 'invalid_token');
      expectOnlyError(await me(renewed.access_token), 401, 'invalid_token');
      expect((await me(second.access_token)).status).toBe(200);
    });

    it('N12: повтор, незнакомый токен и чужой формат — тот же 200 с пустым телом', async () => {
      const { token } = await person();
      await revoke(token);

      for (const unknown of [token, 'u'.repeat(43), 'session.jwt.value']) {
        const res = await revoke(unknown);
        expect(res.status).toBe(200);
        expect(res.text).toBe('');
        expectNativeHeaders(res);
      }
    });

    it('token_type_hint=access_token допустим, другое значение — 400', async () => {
      const { token } = await person();

      const hinted = await request(server())
        .post(`${NATIVE_BASE}/revoke`)
        .type('form')
        .send(`${FORM}&token=${token}&token_type_hint=access_token`);
      const wrong = await request(server())
        .post(`${NATIVE_BASE}/revoke`)
        .type('form')
        .send(`${FORM}&token=${token}&token_type_hint=refresh_token`);

      expect(hinted.status).toBe(200);
      expectOnlyError(wrong, 400, 'invalid_request');
    });

    it('неизвестный client_id — 400 invalid_client, токен не отозван', async () => {
      const { token } = await person();

      const res = await request(server())
        .post(`${NATIVE_BASE}/revoke`)
        .type('form')
        .send(`client_id=someone-else&token=${token}`);

      expectOnlyError(res, 400, 'invalid_client');
      expect((await me(token)).status).toBe(200);
    });

    it.each([
      ['повтор token', (token: string) => `${FORM}&token=${token}&token=${token}`],
      [
        'повтор client_id',
        (token: string) => `${FORM}&client_id=daychi-native&token=${token}`,
      ],
      ['лишнее поле', (token: string) => `${FORM}&token=${token}&extra=1`],
      ['поле в скобках', (token: string) => `${FORM}&token=${token}&token[x]=1`],
      ['нет token', () => FORM],
      ['пустой token', () => `${FORM}&token=`],
    ])(
      'форма не по профилю: %s — 400 invalid_request, токен не отозван',
      async (_name, form) => {
        const { token } = await person();

        const res = await request(server())
          .post(`${NATIVE_BASE}/revoke`)
          .type('form')
          .send(form(token));

        expectOnlyError(res, 400, 'invalid_request');
        expect((await me(token)).status).toBe(200);
      },
    );

    it('JSON и text/plain вместо формы — 400 invalid_request, токен не отозван', async () => {
      const { token } = await person();

      const json = await request(server())
        .post(`${NATIVE_BASE}/revoke`)
        .send({ client_id: 'daychi-native', token });
      const text = await request(server())
        .post(`${NATIVE_BASE}/revoke`)
        .type('text/plain')
        .send(`${FORM}&token=${token}`);

      expectOnlyError(json, 400, 'invalid_request');
      expectOnlyError(text, 400, 'invalid_request');
      expect((await me(token)).status).toBe(200);
    });

    it('не требует ни bearer, ни cookie, ни x-requested-with', async () => {
      const { token } = await person();

      const res = await request(server())
        .post(`${NATIVE_BASE}/revoke`)
        .type('form')
        .send(`${FORM}&token=${token}`);

      expect(res.status).toBe(200);
      expectOnlyError(await me(token), 401, 'invalid_token');
    });
  });

  describe('троттлинг', () => {
    it('429 rate_limited по IP: тело {error}, Retry-After 1..3600, no-store', async () => {
      const limit = NATIVE_AUTH_THROTTLE.default.limit;
      const ip = freshIp();
      const send = (): request.Test =>
        request(server())
          .post(`${NATIVE_BASE}/revoke`)
          .set('x-forwarded-for', ip)
          .type('form')
          .send(`${FORM}&token=${'t'.repeat(43)}`);

      for (let i = 0; i < limit; i++) expect((await send()).status).toBe(200);
      const limited = await send();

      expectOnlyError(limited, 429, 'rate_limited');
      const retryAfter = Number(limited.headers['retry-after']);
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(3600);
    });
  });
});
