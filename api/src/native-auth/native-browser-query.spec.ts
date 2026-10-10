// Разбор адресов браузерной части входа Daychi (профиль Workshop 3c98d4a,
// «Browser authorization and callback», N03): чистые функции, без HTTP.
import { NATIVE_CALLBACK_ERROR_CODES } from '@xuanxue/shared';
import {
  nativeCallbackUrl,
  nativeContinuationPath,
  parseAuthorizeQuery,
  parseContinueQuery,
  type NativeAuthorizeQuery,
} from './native-browser-query';

const STATE = 's'.repeat(43);
const CHALLENGE = 'c'.repeat(43);
const VALID: Record<string, string> = {
  response_type: 'code',
  client_id: 'daychi-native',
  redirect_uri: 'su.xuanxue.daychi:/oauth/cabinet',
  scope: 'account:read',
  state: STATE,
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
};

function authorizeUrl(params: Record<string, string>, extra = ''): string {
  return `/auth/native/authorize?${new URLSearchParams(params).toString()}${extra}`;
}

function withParam(name: string, value: string | undefined): Record<string, string> {
  const params = { ...VALID };
  if (value === undefined) delete params[name];
  else params[name] = value;
  return params;
}

function errorOf(query: NativeAuthorizeQuery): string {
  return query.kind === 'error' ? query.error : query.kind;
}

describe('parseAuthorizeQuery', () => {
  it('запрос по профилю — проверенные параметры', () => {
    expect(parseAuthorizeQuery(authorizeUrl(VALID))).toEqual({
      kind: 'valid',
      request: {
        clientId: 'daychi-native',
        redirectUri: 'su.xuanxue.daychi:/oauth/cabinet',
        scope: 'account:read',
        state: STATE,
        codeChallenge: CHALLENGE,
      },
    });
  });

  it.each([
    ['неизвестный клиент', withParam('client_id', 'someone')],
    ['нет клиента', withParam('client_id', undefined)],
    [
      'redirect с двумя косыми',
      withParam('redirect_uri', 'su.xuanxue.daychi://oauth/cabinet'),
    ],
    [
      'redirect с хвостом',
      withParam('redirect_uri', 'su.xuanxue.daychi:/oauth/cabinet/'),
    ],
    ['короткий state', withParam('state', 's'.repeat(42))],
    ['state с чужими знаками', withParam('state', `${'s'.repeat(42)}=`)],
    ['нет state', withParam('state', undefined)],
  ])('N03: %s — локальная страница, без callback', (_name, params) => {
    expect(parseAuthorizeQuery(authorizeUrl(params))).toEqual({ kind: 'rejected' });
  });

  it.each(['&state=' + STATE, '&scope=account:read', '&extra=1&extra=2'])(
    'N03: повтор параметра (%s) — локальная страница, даже если остальное верно',
    (duplicate) => {
      expect(parseAuthorizeQuery(authorizeUrl(VALID, duplicate))).toEqual({
        kind: 'rejected',
      });
    },
  );

  it('без query — локальная страница', () => {
    expect(parseAuthorizeQuery('/auth/native/authorize')).toEqual({ kind: 'rejected' });
    expect(parseAuthorizeQuery(undefined)).toEqual({ kind: 'rejected' });
  });

  it.each([
    [
      'response_type=token',
      withParam('response_type', 'token'),
      'unsupported_response_type',
    ],
    [
      'нет response_type',
      withParam('response_type', undefined),
      'unsupported_response_type',
    ],
    ['другой scope', withParam('scope', 'account:write'), 'invalid_scope'],
    ['нет challenge', withParam('code_challenge', undefined), 'invalid_request'],
    ['битый challenge', withParam('code_challenge', 'c'.repeat(44)), 'invalid_request'],
    ['метод plain', withParam('code_challenge_method', 'plain'), 'invalid_request'],
    ['лишний параметр', { ...VALID, prompt: 'none' }, 'invalid_request'],
    ['имя в другом регистре', { ...VALID, State: 'x' }, 'invalid_request'],
  ])('после проверки state: %s — %s в callback', (_name, params, expected) => {
    const query = parseAuthorizeQuery(authorizeUrl(params));

    expect(errorOf(query)).toBe(expected);
    expect(query).toMatchObject({ state: STATE });
    expect(NATIVE_CALLBACK_ERROR_CODES).toContain(expected);
  });
});

describe('parseContinueQuery', () => {
  const id = 'a'.repeat(24);

  it('номер попытки и необязательная отмена', () => {
    expect(parseContinueQuery(`/x?attempt=${id}`)).toEqual({
      attemptId: id,
      cancel: false,
    });
    expect(parseContinueQuery(`/x?attempt=${id}&cancel=1`)).toEqual({
      attemptId: id,
      cancel: true,
    });
  });

  it.each([
    ['нет номера', '/x'],
    ['пустой номер', '/x?attempt='],
    ['повтор номера', `/x?attempt=${id}&attempt=${id}`],
    ['cancel не 1', `/x?attempt=${id}&cancel=yes`],
    ['подмена state', `/x?attempt=${id}&state=${STATE}`],
    ['подмена redirect', `/x?attempt=${id}&redirect_uri=https://evil.example`],
  ])('%s — null', (_name, url) => {
    expect(parseContinueQuery(url)).toBeNull();
  });
});

describe('адреса', () => {
  const target = {
    redirectUri: 'su.xuanxue.daychi:/oauth/cabinet',
    state: STATE,
    issuer: 'https://staging.xuanxue.su',
  };

  it('успех — ровно code, state, iss; iss закодирован как компонент query', () => {
    const url = nativeCallbackUrl(target, { code: 'k'.repeat(43) });

    expect(url).toBe(
      `su.xuanxue.daychi:/oauth/cabinet?code=${'k'.repeat(43)}&state=${STATE}` +
        '&iss=https%3A%2F%2Fstaging.xuanxue.su',
    );
  });

  it('ошибка — ровно error, state, iss', () => {
    const url = new URL(nativeCallbackUrl(target, { error: 'access_denied' }));

    expect([...url.searchParams.keys()]).toEqual(['error', 'state', 'iss']);
    expect(url.searchParams.get('iss')).toBe('https://staging.xuanxue.su');
  });

  it('экран входа — относительный адрес с номером попытки', () => {
    expect(nativeContinuationPath('a'.repeat(24))).toBe(
      `/login/native?attempt=${'a'.repeat(24)}`,
    );
  });
});
