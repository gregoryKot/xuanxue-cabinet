// e2e POST /api/auth/native/token (ADR-0181, профиль Workshop «Code exchange»,
// N02, N06, N07): код из callback меняется на bearer ровно один раз, в течение
// 60 секунд, по verifier PKCE S256. Форма — строго по профилю; сессия кабинета
// код не заменяет. Полная цепочка authorize → continue → token → me.
import request from 'supertest';
import {
  NATIVE_CLIENT_ID,
  NATIVE_CODE_LIFETIME_SEC,
  NATIVE_TOKEN_TYPE,
  NATIVE_SCOPE,
  type NativeAccountResponse,
  type NativeTokenResponse,
} from '@xuanxue/shared';
import {
  CONTINUE_PATH,
  TOKEN_PATH,
  attemptOf,
  callbackOf,
  exchange,
  exchangeForm,
  nativeBrowser,
  newPkce,
} from './e2e-support/native-browser-fixtures';
import {
  T0,
  expectNativeHeaders,
  expectOnlyError,
  pinTime,
  useNativeApi,
} from './e2e-support/native-fixtures';
import { createUserWithSession } from './e2e-support/session';

describe('нативный вход Daychi: token (e2e)', () => {
  const api = useNativeApi();

  /** Вход с сессией сразу: код из callback и verifier той же попытки. */
  async function issuedCode(
    status?: 'blocked',
  ): Promise<{ code: string; verifier: string; userId: string; session: string }> {
    const { userId, cookie } = await createUserWithSession(api.app(), {
      name: 'Мария',
      roles: [],
    });
    const pkce = newPkce();
    const callback = callbackOf(await nativeBrowser(api, cookie).authorize(pkce.params));
    if (status) await api.users().updateOne({ _id: userId }, { status });
    return {
      code: callback.get('code') ?? '',
      verifier: pkce.verifier,
      userId,
      session: cookie,
    };
  }

  it('цепочка authorize → вход → continue → token → me', async () => {
    const browser = nativeBrowser(api);
    const pkce = newPkce();
    const attempt = attemptOf(await browser.authorize(pkce.params));
    const { userId, cookie } = await createUserWithSession(api.app(), {
      name: 'Мария',
      roles: [],
    });
    browser.cookies.set('session', cookie);
    const code = callbackOf(await browser.get(`${CONTINUE_PATH}?attempt=${attempt}`)).get(
      'code',
    );

    const res = await exchange(api, exchangeForm(code ?? '', pkce.verifier));

    expect(res.status).toBe(200);
    expectNativeHeaders(res);
    const body = res.body as NativeTokenResponse;
    expect(body.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.token_type).toBe(NATIVE_TOKEN_TYPE);
    expect(body.scope).toBe(NATIVE_SCOPE);
    const me = await api.me(body.access_token);
    expect(me.status).toBe(200);
    expect((me.body as NativeAccountResponse).account.id).toBe(userId);
  });

  it('N06: второй обмен того же кода — invalid_grant', async () => {
    const { code, verifier } = await issuedCode();

    expect((await exchange(api, exchangeForm(code, verifier))).status).toBe(200);
    expectOnlyError(
      await exchange(api, exchangeForm(code, verifier)),
      400,
      'invalid_grant',
    );
  });

  it('N02: неверный verifier — invalid_grant, код при этом не потрачен', async () => {
    const { code, verifier } = await issuedCode();

    const wrong = await exchange(api, exchangeForm(code, newPkce().verifier));
    const right = await exchange(api, exchangeForm(code, verifier));

    expectOnlyError(wrong, 400, 'invalid_grant');
    expect(right.status).toBe(200);
  });

  it('N06: срок кода — +59 секунд обменивается, +60 — invalid_grant', async () => {
    pinTime(T0);
    const early = await issuedCode();
    const late = await issuedCode();

    pinTime(T0.plus({ seconds: NATIVE_CODE_LIFETIME_SEC - 1 }));
    const inTime = await exchange(api, exchangeForm(early.code, early.verifier));
    pinTime(T0.plus({ seconds: NATIVE_CODE_LIFETIME_SEC }));
    const expired = await exchange(api, exchangeForm(late.code, late.verifier));

    expect(inTime.status).toBe(200);
    expectOnlyError(expired, 400, 'invalid_grant');
  });

  it('N07: заблокированный к обмену человек — invalid_grant', async () => {
    const { code, verifier } = await issuedCode('blocked');

    expectOnlyError(
      await exchange(api, exchangeForm(code, verifier)),
      400,
      'invalid_grant',
    );
  });

  it('сессия кабинета код не заменяет: без кода — invalid_request', async () => {
    const { session, verifier } = await issuedCode();
    const form = exchangeForm('', verifier);

    const res = await request(api.server())
      .post(TOKEN_PATH)
      .set('Cookie', session)
      .type('form')
      .send(form);

    expectOnlyError(res, 400, 'invalid_request');
  });

  it.each([
    ['grant_type=refresh_token', 'grant_type=refresh_token', 'unsupported_grant_type'],
    ['чужой client_id', 'client_id=someone', 'invalid_client'],
    [
      'другой redirect_uri',
      'redirect_uri=su.xuanxue.daychi%3A%2Foauth%2Fother',
      'invalid_grant',
    ],
  ])('%s — %s', async (_name, replacement, error) => {
    const { code, verifier } = await issuedCode();
    const [key] = replacement.split('=');
    const form = exchangeForm(code, verifier)
      .split('&')
      .map((pair) => (pair.startsWith(`${key}=`) ? replacement : pair))
      .join('&');

    expectOnlyError(await exchange(api, form), 400, error);
    expect((await exchange(api, exchangeForm(code, verifier))).status).toBe(200);
  });

  it.each([
    ['повтор code', (form: string, code: string) => `${form}&code=${code}`],
    ['повтор client_id', (form: string) => `${form}&client_id=${NATIVE_CLIENT_ID}`],
    ['лишнее поле', (form: string) => `${form}&scope=${NATIVE_SCOPE}`],
  ])(
    'форма не по профилю: %s — invalid_request, код не потрачен',
    async (_name, mutate) => {
      const { code, verifier } = await issuedCode();

      const res = await exchange(api, mutate(exchangeForm(code, verifier), code));

      expectOnlyError(res, 400, 'invalid_request');
      expect((await exchange(api, exchangeForm(code, verifier))).status).toBe(200);
    },
  );

  it('JSON вместо формы — invalid_request', async () => {
    const { code, verifier } = await issuedCode();
    const body = Object.fromEntries(new URLSearchParams(exchangeForm(code, verifier)));

    const res = await request(api.server()).post(TOKEN_PATH).send(body);

    expectOnlyError(res, 400, 'invalid_request');
  });
});
