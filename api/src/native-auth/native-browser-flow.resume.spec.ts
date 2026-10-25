import { NATIVE_AUTHZ_COOKIE } from './native-authz-cookie';
import {
  ATTEMPT,
  BAD_REQUEST,
  BOUND,
  buildFlow,
  callbackOf,
  FAILURES,
  flowRequest,
  HASH,
  NOW,
  SESSION,
  spyOnErrorLog,
  STATE,
  unavailable,
  WITH_CODE,
  withError,
} from './native-browser-flow.service.test-support';

function continuePath(extra = ''): string {
  return `/auth/native/continue?attempt=${ATTEMPT}${extra}`;
}

describe('NativeBrowserFlowService.resume', () => {
  const signedIn = flowRequest(continuePath(), SESSION, BOUND);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['чужой параметр в адресе', flowRequest(continuePath(`&state=${STATE}`), BOUND)],
    ['нет cookie привязки', flowRequest(continuePath(), SESSION)],
    [
      'привязка не нашего формата',
      flowRequest(continuePath(), `${NATIVE_AUTHZ_COOKIE}=x`),
    ],
  ])('%s — страница 400, попытка не ищется', async (_name, req) => {
    const { flow, authorizations } = buildFlow();

    expect(await flow.resume(req, NOW)).toEqual(BAD_REQUEST);
    expect(authorizations.findPending).not.toHaveBeenCalled();
  });

  it.each([
    ['базы нет — 503 без error-лога', unavailable(), 503, 0],
    ['другой сбой — 500 и error-лог', new Error('boom'), 500, 1],
  ])('поиск попытки упал: %s', async (_name, error, status, logs) => {
    const logged = spyOnErrorLog();
    const { flow, authorizations } = buildFlow();
    authorizations.findPending.mockRejectedValue(error);

    const outcome = await flow.resume(signedIn, NOW);

    expect(outcome).toEqual({ kind: 'page', status });
    expect(logged).toHaveBeenCalledTimes(logs);
  });

  it('попытка не найдена, истекла или чужая — страница 400', async () => {
    const { flow, authorizations } = buildFlow();
    authorizations.findPending.mockResolvedValue(null);

    expect(await flow.resume(signedIn, NOW)).toEqual(BAD_REQUEST);
    expect(authorizations.findPending).toHaveBeenCalledWith(ATTEMPT, HASH, NOW);
    expect(authorizations.complete).not.toHaveBeenCalled();
  });

  it('отмена — access_denied без кода', async () => {
    const { flow, authorizations } = buildFlow();

    const outcome = await flow.resume(flowRequest(continuePath('&cancel=1'), BOUND), NOW);

    expect(callbackOf(outcome)).toEqual(withError('access_denied'));
    expect(authorizations.complete).toHaveBeenCalledWith(
      ATTEMPT,
      HASH,
      { denied: true },
      NOW,
    );
  });

  it('завершить не вышло (вторая вкладка успела) — страница 400', async () => {
    const { flow, authorizations } = buildFlow();
    authorizations.complete.mockResolvedValue(null);

    expect(await flow.resume(signedIn, NOW)).toEqual(BAD_REQUEST);
  });

  it('после входа в кабинет — код в callback, параметры из записи', async () => {
    const { flow } = buildFlow();

    const outcome = await flow.resume(signedIn, NOW);

    expect(callbackOf(outcome)).toEqual(WITH_CODE);
    expect(outcome).not.toHaveProperty('cookie');
  });

  it('без сессии — снова экран входа той же попытки', async () => {
    const { flow, authorizations } = buildFlow();

    const outcome = await flow.resume(flowRequest(continuePath(), BOUND), NOW);

    expect(outcome).toEqual({
      kind: 'redirect',
      location: `/login/native?attempt=${ATTEMPT}`,
    });
    expect(authorizations.complete).not.toHaveBeenCalled();
  });

  it.each(FAILURES)(
    'сбой завершения: %s, ошибка в callback',
    async (_n, error, code, logs) => {
      const logged = spyOnErrorLog();
      const { flow, authorizations } = buildFlow();
      authorizations.complete.mockRejectedValue(error);

      const outcome = await flow.resume(signedIn, NOW);

      expect(callbackOf(outcome)).toEqual(withError(code));
      expect(logged).toHaveBeenCalledTimes(logs);
    },
  );
});
