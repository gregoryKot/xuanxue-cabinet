import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  assertEmptyJsonObject,
  assertFormRequest,
  assertNoRequestInput,
  bearerTokenOf,
  configureNativeBodyParsing,
  isNativeFormRequest,
  nativeBodyErrorHandler,
  type NativeRequestLike,
} from './native-http';
import type { NativeResponseLike } from './native-response';

const TOKEN = 'A'.repeat(43);

function request(
  headers: Record<string, string>,
  rest: Partial<NativeRequestLike> = {},
): NativeRequestLike {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    headers: lower,
    rawHeaders: Object.entries(headers).flat(),
    ...rest,
  };
}

function codeOf(action: () => void): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : 'не ошибка';
  }
  return 'ok';
}

describe('bearerTokenOf', () => {
  it('достаёт токен из единственного заголовка Bearer', () => {
    expect(bearerTokenOf(request({ Authorization: `Bearer ${TOKEN}` }))).toBe(TOKEN);
    expect(bearerTokenOf(request({ authorization: `bearer ${TOKEN}` }))).toBe(TOKEN);
  });

  it.each([
    ['нет заголовка', {}],
    ['другая схема', { Authorization: `Basic ${TOKEN}` }],
    ['без токена', { Authorization: 'Bearer ' }],
    ['два токена в строке', { Authorization: `Bearer ${TOKEN} ${TOKEN}` }],
    ['cookie вместо bearer', { Cookie: `session=${TOKEN}` }],
  ])('%s — invalid_token', (_name, headers) => {
    expect(codeOf(() => bearerTokenOf(request(headers)))).toBe('invalid_token');
  });

  it('повтор заголовка Authorization — invalid_token, хотя Node оставляет первый', () => {
    const duplicated: NativeRequestLike = {
      headers: { authorization: `Bearer ${TOKEN}` },
      rawHeaders: [
        'Authorization',
        `Bearer ${TOKEN}`,
        'authorization',
        `Bearer ${TOKEN}`,
      ],
    };

    expect(codeOf(() => bearerTokenOf(duplicated))).toBe('invalid_token');
  });
});

describe('assertNoRequestInput', () => {
  it('чистый запрос проходит, query и тело — invalid_request', () => {
    expect(codeOf(() => assertNoRequestInput(request({})))).toBe('ok');
    expect(codeOf(() => assertNoRequestInput(request({}, { query: { a: '1' } })))).toBe(
      'invalid_request',
    );
    expect(codeOf(() => assertNoRequestInput(request({ 'Content-Length': '2' })))).toBe(
      'invalid_request',
    );
    expect(
      codeOf(() => assertNoRequestInput(request({ 'Transfer-Encoding': 'chunked' }))),
    ).toBe('invalid_request');
  });
});

describe('assertEmptyJsonObject', () => {
  const json = { 'content-type': 'application/json', 'Content-Length': '2' };

  it('принимает ровно {} в JSON, в том числе с charset=utf-8', () => {
    expect(codeOf(() => assertEmptyJsonObject(request(json, { body: {} })))).toBe('ok');
    expect(
      codeOf(() =>
        assertEmptyJsonObject(
          request(
            { ...json, 'content-type': 'application/json; charset=UTF-8' },
            { body: {} },
          ),
        ),
      ),
    ).toBe('ok');
  });

  it.each([
    ['тела нет', json, undefined],
    ['массив', json, []],
    ['строка', json, 'x'],
    ['null', json, null],
    ['лишнее поле', json, { a: 1 }],
    ['не JSON', { ...json, 'content-type': 'text/plain' }, {}],
    ['не UTF-8', { ...json, 'content-type': 'application/json; charset=utf-16' }, {}],
    [
      'пустой Content-Length',
      { 'content-type': 'application/json', 'Content-Length': '0' },
      {},
    ],
  ])('%s — invalid_request', (_name, headers, body) => {
    expect(codeOf(() => assertEmptyJsonObject(request(headers, { body })))).toBe(
      'invalid_request',
    );
  });
});

describe('assertFormRequest и предикат парсера форм', () => {
  const form = { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' };

  it('форму принимает, JSON и отсутствие типа — нет', () => {
    expect(codeOf(() => assertFormRequest(request(form)))).toBe('ok');
    expect(
      codeOf(() => assertFormRequest(request({ 'content-type': 'application/json' }))),
    ).toBe('invalid_request');
    expect(codeOf(() => assertFormRequest(request({})))).toBe('invalid_request');
  });

  it('парсер форм включается только для POST revoke с формой', () => {
    const base = { method: 'POST', url: '/api/auth/native/revoke', headers: form };

    expect(isNativeFormRequest(base)).toBe(true);
    expect(isNativeFormRequest({ ...base, url: '/api/auth/native/revoke?x=1' })).toBe(
      true,
    );
    expect(isNativeFormRequest({ ...base, method: 'GET' })).toBe(false);
    expect(isNativeFormRequest({ ...base, url: '/api/auth/native/renew' })).toBe(false);
    expect(isNativeFormRequest({ ...base, url: '/api/auth/login' })).toBe(false);
    expect(
      isNativeFormRequest({ ...base, headers: { 'content-type': 'application/json' } }),
    ).toBe(false);
  });
});

describe('nativeBodyErrorHandler', () => {
  const parseError = Object.assign(new Error('Unexpected token'), {
    type: 'entity.parse.failed',
    status: 400,
  });

  function responseSpy(): { res: NativeResponseLike; sent: unknown[] } {
    const sent: unknown[] = [];
    const res: NativeResponseLike = {
      status: () => res,
      setHeader: () => undefined,
      getHeader: () => undefined,
      json: (body) => sent.push(body),
    };
    return { res, sent };
  }

  it('ошибка парсера на нативном пути — invalid_request, дальше не идёт', () => {
    const { res, sent } = responseSpy();
    const next = jest.fn();

    nativeBodyErrorHandler(parseError, { url: '/api/auth/native/renew' }, res, next);

    expect(sent).toEqual([{ error: 'invalid_request' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('на чужом пути и при чужой ошибке передаёт её дальше без изменений', () => {
    const { res, sent } = responseSpy();
    const next = jest.fn();
    const other = new Error('не парсер');

    nativeBodyErrorHandler(parseError, { url: '/api/classes' }, res, next);
    nativeBodyErrorHandler(other, { url: '/api/auth/native/me' }, res, next);

    expect(sent).toEqual([]);
    expect(next.mock.calls).toEqual([[parseError], [other]]);
  });
});

describe('configureNativeBodyParsing', () => {
  it('форма — без вложенных ключей, только нативные маршруты, ошибки парсера — свои', () => {
    const app = { useBodyParser: jest.fn(), use: jest.fn() };

    configureNativeBodyParsing(app as unknown as NestExpressApplication);

    expect(app.useBodyParser.mock.calls).toEqual([
      ['urlencoded', { extended: false, type: isNativeFormRequest, limit: '4kb' }],
    ]);
    expect(app.use.mock.calls).toEqual([[nativeBodyErrorHandler]]);
  });
});
