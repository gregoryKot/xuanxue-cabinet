// e2e GET /api/auth/native/continue (ADR-0181, профиль Workshop «Browser
// authorization and callback»): экран входа кабинета возвращает браузер сюда
// после входа. Попытка годится только своя — та же привязка `native_authz`,
// не истёкшая (900 секунд от создания), не завершённая; параметры callback
// берутся из записи, а не из адреса. Чужое — локальная страница 400.
import { NATIVE_ATTEMPT_LIFETIME_SEC } from '@xuanxue/shared';
import {
  CONTINUE_PATH,
  TEST_ISSUER,
  attemptOf,
  callbackOf,
  expectBrowserHeaders,
  expectLocalPage,
  nativeBrowser,
  newPkce,
  setCookiesOf,
  type NativeBrowser,
} from './e2e-support/native-browser-fixtures';
import { T0, pinTime, useNativeApi } from './e2e-support/native-fixtures';
import { createUserWithSession } from './e2e-support/session';

describe('нативный вход Daychi: continue (e2e)', () => {
  const api = useNativeApi();

  /** Браузер без сессии начал вход; вернуть номер попытки и state. */
  async function started(
    browser: NativeBrowser,
  ): Promise<{ attempt: string; state: string }> {
    const pkce = newPkce();
    const attempt = attemptOf(await browser.authorize(pkce.params));
    return { attempt, state: pkce.state };
  }

  async function signIn(browser: NativeBrowser, status?: 'blocked'): Promise<void> {
    const { cookie } = await createUserWithSession(api.app(), {
      name: 'Мария',
      roles: [],
      status,
    });
    browser.cookies.set('session', cookie);
  }

  it('после входа в кабинет — callback с code и state этой попытки', async () => {
    const browser = nativeBrowser(api);
    const { attempt, state } = await started(browser);
    await signIn(browser);

    const res = await browser.get(`${CONTINUE_PATH}?attempt=${attempt}`);

    const callback = callbackOf(res);
    expect([...callback.keys()]).toEqual(['code', 'state', 'iss']);
    expect(callback.get('state')).toBe(state);
    expect(callback.get('iss')).toBe(TEST_ISSUER);
    expectBrowserHeaders(res);
    expect(setCookiesOf(res)).toEqual([]);
  });

  it('ещё без сессии — снова экран входа той же попытки', async () => {
    const browser = nativeBrowser(api);
    const { attempt } = await started(browser);

    const res = await browser.get(`${CONTINUE_PATH}?attempt=${attempt}`);

    expect(attemptOf(res)).toBe(attempt);
  });

  it('заблокированному — access_denied', async () => {
    const browser = nativeBrowser(api);
    const { attempt, state } = await started(browser);
    await signIn(browser, 'blocked');

    const callback = callbackOf(await browser.get(`${CONTINUE_PATH}?attempt=${attempt}`));

    expect([...callback.entries()]).toEqual([
      ['error', 'access_denied'],
      ['state', state],
      ['iss', TEST_ISSUER],
    ]);
  });

  it('отмена — access_denied, попытка завершена', async () => {
    const browser = nativeBrowser(api);
    const { attempt, state } = await started(browser);

    const cancelled = await browser.get(`${CONTINUE_PATH}?attempt=${attempt}&cancel=1`);
    await signIn(browser);
    const after = await browser.get(`${CONTINUE_PATH}?attempt=${attempt}`);

    expect(callbackOf(cancelled).get('error')).toBe('access_denied');
    expect(callbackOf(cancelled).get('state')).toBe(state);
    expectLocalPage(after, 400);
  });

  it('повтор после кода — локальная страница 400, второго кода нет', async () => {
    const browser = nativeBrowser(api);
    const { attempt } = await started(browser);
    await signIn(browser);
    await browser.get(`${CONTINUE_PATH}?attempt=${attempt}`);

    expectLocalPage(await browser.get(`${CONTINUE_PATH}?attempt=${attempt}`), 400);
  });

  it('чужая или пустая привязка — локальная страница 400', async () => {
    const owner = nativeBrowser(api);
    const { attempt } = await started(owner);
    const stranger = nativeBrowser(api);
    await started(stranger);
    await signIn(stranger);
    const bare = nativeBrowser(api);
    await signIn(bare);

    expectLocalPage(await stranger.get(`${CONTINUE_PATH}?attempt=${attempt}`), 400);
    expectLocalPage(await bare.get(`${CONTINUE_PATH}?attempt=${attempt}`), 400);
  });

  it('подмена параметров в адресе — 400; callback берёт state из записи', async () => {
    const browser = nativeBrowser(api);
    const { attempt, state } = await started(browser);
    await signIn(browser);
    const forged = `${CONTINUE_PATH}?attempt=${attempt}&state=${'x'.repeat(43)}`;

    expectLocalPage(await browser.get(forged), 400);
    const callback = callbackOf(await browser.get(`${CONTINUE_PATH}?attempt=${attempt}`));
    expect(callback.get('state')).toBe(state);
  });

  it('две попытки одного браузера — у каждой свой state и свой код', async () => {
    const browser = nativeBrowser(api);
    const first = await started(browser);
    const second = await started(browser);
    await signIn(browser);

    const a = callbackOf(await browser.get(`${CONTINUE_PATH}?attempt=${first.attempt}`));
    const b = callbackOf(await browser.get(`${CONTINUE_PATH}?attempt=${second.attempt}`));

    expect(a.get('state')).toBe(first.state);
    expect(b.get('state')).toBe(second.state);
    expect(a.get('code')).not.toBe(b.get('code'));
  });

  it.each([
    ['номер не того формата', '?attempt=zzz'],
    ['несуществующий номер', `?attempt=${'0'.repeat(24)}`],
    ['без номера', ''],
  ])('%s — локальная страница 400', async (_name, query) => {
    const browser = nativeBrowser(api);
    await started(browser);
    await signIn(browser);

    expectLocalPage(await browser.get(`${CONTINUE_PATH}${query}`), 400);
  });

  it('срок попытки: +899 секунд — код, +900 — страница 400', async () => {
    pinTime(T0);
    const early = nativeBrowser(api);
    const late = nativeBrowser(api);
    const a = await started(early);
    const b = await started(late);
    await signIn(early);
    await signIn(late);

    pinTime(T0.plus({ seconds: NATIVE_ATTEMPT_LIFETIME_SEC - 1 }));
    const inTime = await early.get(`${CONTINUE_PATH}?attempt=${a.attempt}`);
    pinTime(T0.plus({ seconds: NATIVE_ATTEMPT_LIFETIME_SEC }));
    const expired = await late.get(`${CONTINUE_PATH}?attempt=${b.attempt}`);

    expect(callbackOf(inTime).get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expectLocalPage(expired, 400);
  });
});
