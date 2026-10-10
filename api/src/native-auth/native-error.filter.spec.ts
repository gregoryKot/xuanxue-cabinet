import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { NATIVE_ERROR_CODES, type NativeErrorCode } from '@xuanxue/shared';
import { NativeAuthError, NATIVE_ERROR_STATUS } from './native-auth-error';
import { NativeErrorFilter } from './native-error.filter';
import type { NativeResponseLike } from './native-response';

class FakeResponse implements NativeResponseLike {
  statusCode = 0;
  body: unknown;
  readonly headers = new Map<string, string | number>();

  constructor(preset: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(preset)) {
      this.headers.set(name.toLowerCase(), value);
    }
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string | number): void {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name: string): string | number | undefined {
    return this.headers.get(name.toLowerCase());
  }

  json(body: unknown): void {
    this.body = body;
  }
}

function hostOf(res: FakeResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ id: 'req-1' }) }),
  } as unknown as ArgumentsHost;
}

function run(exception: unknown, preset: Record<string, string> = {}): FakeResponse {
  const res = new FakeResponse(preset);
  new NativeErrorFilter().catch(exception, hostOf(res));
  return res;
}

describe('NativeErrorFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(NATIVE_ERROR_CODES)('%s: статус из карты, тело — только {error}', (code) => {
    const res = run(new NativeAuthError(code));

    expect(res.statusCode).toBe(NATIVE_ERROR_STATUS[code]);
    expect(res.body).toEqual({ error: code });
  });

  it('каждый ответ несёт no-store и не ставит cookie', () => {
    const responses = NATIVE_ERROR_CODES.map((code) => run(new NativeAuthError(code)));

    for (const res of responses) {
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('pragma')).toBe('no-cache');
      expect(res.headers.has('set-cookie')).toBe(false);
    }
  });

  it('WWW-Authenticate — только у 401', () => {
    const withChallenge = NATIVE_ERROR_CODES.filter((code: NativeErrorCode) =>
      run(new NativeAuthError(code)).headers.has('www-authenticate'),
    );

    expect(withChallenge).toEqual(['invalid_token']);
    expect(
      run(new NativeAuthError('invalid_token')).headers.get('www-authenticate'),
    ).toBe('Bearer error="invalid_token"');
  });

  it('ошибка валидации и любая клиентская ошибка Nest — invalid_request', () => {
    const validation = run(new BadRequestException(['token must be a string']));
    const other = run(new ForbiddenException('чужое сообщение'));

    for (const res of [validation, other]) {
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_request' });
    }
  });

  describe('429 от ThrottlerGuard', () => {
    it('rate_limited и целый Retry-After троттлера сохраняется', () => {
      const res = run(new ThrottlerException(), { 'Retry-After': '42' });

      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({ error: 'rate_limited' });
      expect(res.headers.get('retry-after')).toBe(42);
    });

    it.each([
      ['0', 1],
      ['-5', 1],
      ['99999', 3600],
      ['3600', 3600],
      ['abc', 60],
    ])('Retry-After «%s» приводится к %i', (given, expected) => {
      expect(
        run(new ThrottlerException(), { 'Retry-After': given }).headers.get(
          'retry-after',
        ),
      ).toBe(expected);
    });

    it('без заголовка от троттлера — окно в 60 секунд', () => {
      expect(run(new ThrottlerException()).headers.get('retry-after')).toBe(60);
    });
  });

  describe('база недоступна', () => {
    it.each([
      'MongoServerSelectionError',
      'MongooseServerSelectionError',
      'MongoNetworkError',
      'MongoNetworkTimeoutError',
    ])('%s — 503 temporarily_unavailable без записи в лог ошибок', (name) => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const error = Object.assign(new Error('connect ECONNREFUSED'), { name });

      const res = run(error);

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: 'temporarily_unavailable' });
      expect(logged).not.toHaveBeenCalled();
    });
  });

  describe('неожиданный сбой', () => {
    it('500 server_error без текста исключения и error-лог со стеком', () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const failure = new Error('внутренняя деталь');

      const res = run(failure);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'server_error' });
      expect(logged).toHaveBeenCalledTimes(1);
      const [message, stack] = logged.mock.calls[0] ?? [];
      expect(message).toContain('req-1');
      expect(stack).toBe(failure.stack);
    });

    it('серверная HttpException Nest — тоже server_error', () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const res = run(new InternalServerErrorException());

      expect(res.body).toEqual({ error: 'server_error' });
    });
  });
});
