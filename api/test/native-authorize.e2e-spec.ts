// e2e GET /auth/native/authorize (ADR-0181, профиль Workshop «Browser
// authorization and callback», N03): маршрут от корня сайта, вне `/api`.
// Ошибка до проверки клиента, redirect URI и state — локальная страница 400
// без перехода; после — callback ровно с `error`, `state`, `iss`. С сессией
// активного человека — код сразу, заблокированному — `access_denied`, без
// сессии — экран входа кабинета. Ставится только cookie привязки.
import request from 'supertest';
import { NATIVE_AUTH_THROTTLE } from '../src/auth/login-throttle';
import {
  AUTHORIZE_PATH,
  TEST_ISSUER,
  attemptOf,
  callbackOf,
  expectBrowserHeaders,
  expectLocalPage,
  nativeBrowser,
  newPkce,
  setCookiesOf,
} from './e2e-support/native-browser-fixtures';
import { useNativeApi } from './e2e-support/native-fixtures';
import { createUserWithSession } from './e2e-support/session';

describe('нативный вход Daychi: authorize (e2e)', () => {
  const api = useNativeApi();
  const signedIn = async (status?: 'blocked'): Promise<string> =>
    (await createUserWithSession(api.app(), { name: 'Мария', roles: [], status })).cookie;

  it('маршрут живёт от корня: под /api его нет', async () => {
    const { params } = newPkce();
    const query = new URLSearchParams(params).toString();

    const root = await request(api.server()).get(`${AUTHORIZE_PATH}?${query}`);
    const prefixed = await request(api.server()).get(`/api${AUTHORIZE_PATH}?${query}`);

    expect(root.status).toBe(302);
    expect(prefixed.status).toBe(404);
  });

  it('без сессии — экран входа с номером попытки и cookie привязки', async () => {
    const browser = nativeBrowser(api);

    const res = await browser.authorize(newPkce().params);

    attemptOf(res);
    expectBrowserHeaders(res);
    const [cookie] = setCookiesOf(res);
    expect(cookie).toMatch(
      /^native_authz=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=900$/,
    );
  });

  it('с сессией активного человека — callback ровно с code, state, iss', async () => {
    const browser = nativeBrowser(api, await signedIn());
    const pkce = newPkce();

    const res = await browser.authorize(pkce.params);

    const callback = callbackOf(res);
    expect([...callback.keys()]).toEqual(['code', 'state', 'iss']);
    expect(callback.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(callback.get('state')).toBe(pkce.state);
    expect(callback.get('iss')).toBe(TEST_ISSUER);
    expectBrowserHeaders(res);
    expect(setCookiesOf(res)).toHaveLength(1);
  });

  it('заблокированному — access_denied, без кода', async () => {
    const browser = nativeBrowser(api, await signedIn('blocked'));
    const pkce = newPkce();

    const callback = callbackOf(await browser.authorize(pkce.params));

    expect([...callback.entries()]).toEqual([
      ['error', 'access_denied'],
      ['state', pkce.state],
      ['iss', TEST_ISSUER],
    ]);
  });

  it('браузер с привязкой сохраняет её на следующей попытке', async () => {
    const browser = nativeBrowser(api);
    await browser.authorize(newPkce().params);
    const first = browser.cookies.get('native_authz');

    const res = await browser.authorize(newPkce().params);

    expect(setCookiesOf(res)[0]?.split(';')[0]).toBe(first);
  });

  it.each([
    ['client_id', 'someone'],
    ['redirect_uri', 'su.xuanxue.daychi://oauth/cabinet'],
    ['redirect_uri', 'https://evil.example/cb'],
    ['state', 'short'],
  ])(
    'N03: %s=%s — локальная страница 400, без callback и cookie',
    async (name, value) => {
      const { params } = newPkce();

      const res = await nativeBrowser(api).authorize({ ...params, [name]: value });

      expectLocalPage(res, 400);
      expect(setCookiesOf(res)).toEqual([]);
    },
  );

  it.each(['client_id', 'state', 'code_challenge'])(
    'N03: повтор %s — локальная страница 400',
    async (name) => {
      const { params } = newPkce();

      const res = await nativeBrowser(api).authorize(params, `&${name}=${params[name]}`);

      expectLocalPage(res, 400);
    },
  );

  it.each([
    ['response_type', 'token', 'unsupported_response_type'],
    ['scope', 'account:write', 'invalid_scope'],
    ['code_challenge_method', 'plain', 'invalid_request'],
    ['code_challenge', 'not-a-challenge', 'invalid_request'],
    ['prompt', 'none', 'invalid_request'],
  ])('%s=%s — callback с error=%s, без cookie привязки', async (name, value, error) => {
    const pkce = newPkce();
    const browser = nativeBrowser(api, await signedIn());

    const res = await browser.authorize({ ...pkce.params, [name]: value });

    expect([...callbackOf(res).entries()]).toEqual([
      ['error', error],
      ['state', pkce.state],
      ['iss', TEST_ISSUER],
    ]);
    expect(setCookiesOf(res)).toEqual([]);
    expectBrowserHeaders(res);
  });

  it('сессия кабинета не продлевается и не ставится заново', async () => {
    const browser = nativeBrowser(api, await signedIn());

    const res = await browser.authorize(newPkce().params);

    expect(setCookiesOf(res).some((cookie) => cookie.startsWith('session='))).toBe(false);
  });

  it('429 по IP — та же страница, Retry-After 1..3600, no-store', async () => {
    const browser = nativeBrowser(api);
    const rejected = { client_id: 'someone' };
    for (let i = 0; i < NATIVE_AUTH_THROTTLE.default.limit; i++) {
      expect((await browser.authorize(rejected)).status).toBe(400);
    }

    const limited = await browser.authorize(rejected);

    expectLocalPage(limited, 429);
    const retryAfter = Number(limited.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });
});
