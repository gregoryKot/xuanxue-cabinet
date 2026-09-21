// Чистая логика без Mongo/DI/HTTP-сервера (CLAUDE.md «Тесты») — счётчик и
// его освобождение проверяются напрямую, через фейковые `res.once`.
import type { ApiErrorBody } from '@xuanxue/shared';
import {
  makeRawUploadConcurrencyLimit,
  RAW_UPLOAD_CONCURRENCY_LIMIT,
} from './raw-upload-concurrency';

function req(headers: Record<string, string | string[] | undefined> = {}): {
  headers: Record<string, string | string[] | undefined>;
} {
  return { headers };
}

/** Фейковый Express-ответ: `status`/`set` возвращают себя же (цепочка, как
 * у настоящего res), `once` копит слушателей `finish`/`close`, `fire`
 * зовёт их вручную — тест управляет завершением запроса сам. */
function fakeRes() {
  const listeners: Record<'finish' | 'close', (() => void)[]> = { finish: [], close: [] };
  const state: {
    statusCode?: number;
    headers: Record<string, string>;
    body?: ApiErrorBody;
  } = { headers: {} };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    set(name: string, value: string) {
      state.headers[name] = value;
      return res;
    },
    json(body: ApiErrorBody) {
      state.body = body;
    },
    once(event: 'finish' | 'close', listener: () => void) {
      listeners[event].push(listener);
      return res;
    },
  };
  return {
    res,
    state,
    fire: (event: 'finish' | 'close') =>
      listeners[event].forEach((listener) => listener()),
  };
}

describe('makeRawUploadConcurrencyLimit', () => {
  it('запрос мимо matches — не считается, next() вызван', () => {
    const middleware = makeRawUploadConcurrencyLimit(() => false, 1);
    const next = jest.fn();
    middleware(req(), fakeRes().res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('в пределах потолка — пускает все, next() на каждый', () => {
    const middleware = makeRawUploadConcurrencyLimit(() => true, 4);
    const next = jest.fn();
    for (let i = 0; i < 4; i++) {
      middleware(req(), fakeRes().res, next);
    }
    expect(next).toHaveBeenCalledTimes(4);
  });

  it('сверх потолка — 503 с Retry-After, next() не вызван', () => {
    const middleware = makeRawUploadConcurrencyLimit(() => true, 1);
    const next = jest.fn();
    middleware(req(), fakeRes().res, next); // занимает единственный слот, не освобождает
    const fifth = fakeRes();
    middleware(req({ 'x-request-id': 'req-42' }), fifth.res, next);

    expect(next).toHaveBeenCalledTimes(1); // только первый запрос
    expect(fifth.state.statusCode).toBe(503);
    expect(fifth.state.headers['Retry-After']).toBe('10');
    expect(fifth.state.body).toMatchObject({
      statusCode: 503,
      code: 'not_available',
      requestId: 'req-42',
    });
    expect(fifth.state.body?.message).toMatch(/загрузка/);
  });

  it('слот освобождается на finish — следующий запрос проходит', () => {
    const middleware = makeRawUploadConcurrencyLimit(() => true, 1);
    const next = jest.fn();
    const first = fakeRes();
    middleware(req(), first.res, next);
    first.fire('finish');

    const second = fakeRes();
    middleware(req(), second.res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(second.state.statusCode).toBeUndefined();
  });

  it('слот освобождается на close — следующий запрос проходит', () => {
    const middleware = makeRawUploadConcurrencyLimit(() => true, 1);
    const next = jest.fn();
    const first = fakeRes();
    middleware(req(), first.res, next);
    first.fire('close');

    const second = fakeRes();
    middleware(req(), second.res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(second.state.statusCode).toBeUndefined();
  });

  it('finish и close оба пришли на один запрос — слот освобождён один раз', () => {
    const middleware = makeRawUploadConcurrencyLimit(() => true, 1);
    const next = jest.fn();
    const first = fakeRes();
    middleware(req(), first.res, next);
    first.fire('finish');
    first.fire('close'); // не должен вычесть слот повторно

    const second = fakeRes();
    middleware(req(), second.res, next);
    const third = fakeRes();
    middleware(req(), third.res, next);

    // Один свободный слот после first — прошёл только second, third отказан.
    expect(second.state.statusCode).toBeUndefined();
    expect(third.state.statusCode).toBe(503);
  });

  it('без явного limit — берёт RAW_UPLOAD_CONCURRENCY_LIMIT по умолчанию', () => {
    const middleware = makeRawUploadConcurrencyLimit(() => true);
    const next = jest.fn();
    for (let i = 0; i < RAW_UPLOAD_CONCURRENCY_LIMIT; i++) {
      middleware(req(), fakeRes().res, next);
    }
    const overLimit = fakeRes();
    middleware(req(), overLimit.res, next);

    expect(next).toHaveBeenCalledTimes(RAW_UPLOAD_CONCURRENCY_LIMIT);
    expect(overLimit.state.statusCode).toBe(503);
  });

  it('без заголовка x-request-id — requestId всё равно есть (randomUUID)', () => {
    const middleware = makeRawUploadConcurrencyLimit(() => true, 0);
    const only = fakeRes();
    middleware(req(), only.res, jest.fn());
    expect(only.state.body?.requestId).toEqual(expect.any(String));
    expect(only.state.body?.requestId?.length).toBeGreaterThan(0);
  });
});
