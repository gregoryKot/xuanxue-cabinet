import { NATIVE_CLIENT_ID, NATIVE_REDIRECT_URI, NATIVE_SCOPE } from '@xuanxue/shared';
import { NATIVE_AUTHZ_COOKIE } from './native-authz-cookie';
import type { NativeBrowserOutcome } from './native-browser-response';
import {
  ATTEMPT,
  BAD_REQUEST,
  BOUND,
  buildFlow,
  callbackOf,
  FAILURES,
  flowRequest,
  HASH,
  locationOf,
  NOW,
  SESSION,
  spyOnErrorLog,
  STATE,
  TARGET,
  WITH_CODE,
  withError,
} from './native-browser-flow.service.test-support';
import { sha256Hex } from './native-secrets';

const CHALLENGE = 'c'.repeat(43);
const VALID: Record<string, string> = {
  response_type: 'code',
  client_id: NATIVE_CLIENT_ID,
  redirect_uri: NATIVE_REDIRECT_URI,
  scope: NATIVE_SCOPE,
  state: STATE,
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
};

function authorizePath(params: Record<string, string> = VALID): string {
  return `/auth/native/authorize?${new URLSearchParams(params).toString()}`;
}

function cookieOf(outcome: NativeBrowserOutcome): string {
  return outcome.kind === 'redirect' ? (outcome.cookie ?? '') : '';
}

describe('NativeBrowserFlowService.authorize', () => {
  const signedIn = flowRequest(authorizePath(), SESSION, BOUND);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('клиент, redirect или state не прошли — локальная страница 400, попытки нет', async () => {
    const { flow, authorizations } = buildFlow();
    const req = flowRequest(authorizePath({ ...VALID, client_id: 'someone' }));

    expect(await flow.authorize(req, NOW)).toEqual(BAD_REQUEST);
    expect(authorizations.create).not.toHaveBeenCalled();
  });

  it('PUBLIC_URL не задан — страница 500 и error-лог с кодом обращения', async () => {
    const logged = spyOnErrorLog();
    const { flow } = buildFlow({ publicUrl: '' });

    const outcome = await flow.authorize(flowRequest(authorizePath()), NOW);

    expect(outcome).toEqual({ kind: 'page', status: 500 });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('requestId=req-1'),
      expect.any(String),
    );
  });

  it('ошибка после проверки state — в callback, без cookie и без попытки', async () => {
    const { flow, authorizations } = buildFlow();
    const req = flowRequest(authorizePath({ ...VALID, scope: 'account:write' }));

    const outcome = await flow.authorize(req, NOW);

    expect(callbackOf(outcome)).toEqual(withError('invalid_scope'));
    expect(outcome).not.toHaveProperty('cookie');
    expect(authorizations.create).not.toHaveBeenCalled();
  });

  it('активная сессия — код в callback и продлённая привязка браузера', async () => {
    const { flow, authorizations } = buildFlow();

    const outcome = await flow.authorize(signedIn, NOW);

    expect(callbackOf(outcome)).toEqual(WITH_CODE);
    expect(cookieOf(outcome)).toMatch(new RegExp(`^${BOUND}; `));
    const params = { ...TARGET, clientId: NATIVE_CLIENT_ID, scope: NATIVE_SCOPE };
    expect(authorizations.create).toHaveBeenCalledWith(
      { ...params, codeChallenge: CHALLENGE },
      HASH,
      NOW,
    );
    expect(authorizations.complete).toHaveBeenCalledWith(
      ATTEMPT,
      HASH,
      { userId: 'u1' },
      NOW,
    );
  });

  it('заблокированный человек — access_denied без кода', async () => {
    const { flow, authorizations } = buildFlow({ status: 'blocked' });

    const outcome = await flow.authorize(signedIn, NOW);

    expect(callbackOf(outcome)).toEqual(withError('access_denied'));
    expect(authorizations.complete).toHaveBeenCalledWith(
      ATTEMPT,
      HASH,
      { denied: true },
      NOW,
    );
  });

  it('без сессии — экран входа с номером попытки и новая привязка в cookie', async () => {
    const { flow, authorizations } = buildFlow();

    const outcome = await flow.authorize(flowRequest(authorizePath()), NOW);

    const location = locationOf(outcome);
    expect(location.pathname).toBe('/login/native');
    expect(Object.fromEntries(location.searchParams)).toEqual({ attempt: ATTEMPT });
    const issued = new RegExp(`^${NATIVE_AUTHZ_COOKIE}=([A-Za-z0-9_-]{43});`).exec(
      cookieOf(outcome),
    )?.[1];
    expect(issued).toBeDefined();
    expect(authorizations.create).toHaveBeenCalledWith(
      expect.anything(),
      sha256Hex(issued ?? ''),
      NOW,
    );
    expect(authorizations.complete).not.toHaveBeenCalled();
  });

  it('завершить попытку не вышло — страница 400 без cookie', async () => {
    const { flow, authorizations } = buildFlow();
    authorizations.complete.mockResolvedValue(null);

    expect(await flow.authorize(signedIn, NOW)).toEqual(BAD_REQUEST);
  });

  it('без originalUrl адрес читается из url', async () => {
    const { flow } = buildFlow();
    const { originalUrl, ...rest } = signedIn;

    const outcome = await flow.authorize({ ...rest, url: originalUrl }, NOW);

    expect(callbackOf(outcome)).toEqual(WITH_CODE);
  });

  it.each(FAILURES)(
    'сбой попытки: %s, ошибка в callback',
    async (_n, error, code, logs) => {
      const logged = spyOnErrorLog();
      const { flow, authorizations } = buildFlow();
      authorizations.create.mockRejectedValue(error);

      const outcome = await flow.authorize(signedIn, NOW);

      expect(callbackOf(outcome)).toEqual(withError(code));
      expect(logged).toHaveBeenCalledTimes(logs);
    },
  );
});
