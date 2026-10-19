// Бюджет GET native/me без HTTP и без базы: окно, Retry-After и выбор ключа
// после проверки bearer (контракт native-content-session a07f087, C09–C12).
// HTTP с настоящим маршрутом — api/test/native-me-budget.e2e-spec.ts.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { NativeAuthError, NativeRateLimitedError } from './native-auth-error';
import type { NativeAuthentication } from './native-grants.service';
import {
  NATIVE_ME_LIMIT,
  NATIVE_ME_WINDOW_SEC,
  NativeMeLimiter,
  SlidingWindowLog,
} from './native-me-limiter';

const T0 = DateTime.fromISO('2026-10-19T10:00:00.000Z', { zone: 'utc' });
const IP = '10.0.0.1';

function at(seconds: number): DateTime {
  return T0.plus({ milliseconds: Math.round(seconds * 1000) });
}

function fill(log: SlidingWindowLog, key: string, now: DateTime): void {
  for (let i = 0; i < NATIVE_ME_LIMIT; i++) log.consume(key, now);
}

function authOf(grantId: Types.ObjectId): NativeAuthentication {
  return { grant: { _id: grantId } } as unknown as NativeAuthentication;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('ожидался отказ');
    },
    (error: unknown) => error,
  );
}

describe('SlidingWindowLog', () => {
  it('лимит проверок проходит, следующая — отказ со сроком до выхода самой старой', () => {
    const log = new SlidingWindowLog(NATIVE_ME_LIMIT, NATIVE_ME_WINDOW_SEC);
    fill(log, 'a', T0);

    expect(log.consume('a', at(20))).toEqual({ allowed: false, retryAfterSec: 40 });
  });

  it('C11: на возрасте ровно 60 секунд старая проверка уже не считается', () => {
    const log = new SlidingWindowLog(NATIVE_ME_LIMIT, NATIVE_ME_WINDOW_SEC);
    fill(log, 'a', T0);

    expect(log.consume('a', at(59.999))).toEqual({ allowed: false, retryAfterSec: 1 });
    expect(log.consume('a', at(60))).toEqual({ allowed: true });
  });

  it('C11: отказы окно не продлевают', () => {
    const log = new SlidingWindowLog(NATIVE_ME_LIMIT, NATIVE_ME_WINDOW_SEC);
    fill(log, 'a', T0);
    for (let second = 1; second < 60; second++) log.consume('a', at(second));

    expect(log.consume('a', at(60))).toEqual({ allowed: true });
  });

  it('окно скользящее: освобождается столько, сколько вышло', () => {
    const log = new SlidingWindowLog(NATIVE_ME_LIMIT, NATIVE_ME_WINDOW_SEC);
    log.consume('a', T0);
    for (let i = 1; i < NATIVE_ME_LIMIT; i++) log.consume('a', at(30));

    expect(log.consume('a', at(60))).toEqual({ allowed: true });
    expect(log.consume('a', at(60))).toEqual({ allowed: false, retryAfterSec: 30 });
  });

  it('Retry-After — целые секунды вверх, от 1 до 60', () => {
    const log = new SlidingWindowLog(NATIVE_ME_LIMIT, NATIVE_ME_WINDOW_SEC);
    fill(log, 'a', T0);

    expect(log.consume('a', T0)).toEqual({ allowed: false, retryAfterSec: 60 });
    expect(log.consume('a', at(0.4))).toEqual({ allowed: false, retryAfterSec: 60 });
    expect(log.consume('a', at(30.5))).toEqual({ allowed: false, retryAfterSec: 30 });
  });

  it('ключи независимы', () => {
    const log = new SlidingWindowLog(NATIVE_ME_LIMIT, NATIVE_ME_WINDOW_SEC);
    fill(log, 'a', T0);

    expect(log.consume('b', T0)).toEqual({ allowed: true });
  });

  it('ключ без проверок за окно убирается из памяти', () => {
    const log = new SlidingWindowLog(NATIVE_ME_LIMIT, NATIVE_ME_WINDOW_SEC);
    log.consume('a', T0);
    log.consume('b', at(30));

    log.consume('c', at(61));

    expect(log.size()).toBe(2);
    log.consume('c', at(122));
    expect(log.size()).toBe(1);
  });
});

describe('NativeMeLimiter.admit', () => {
  it('C09: исчерпанный грант A — 429 со сроком, грант B за тем же IP проходит', async () => {
    const limiter = new NativeMeLimiter();
    const grantA = authOf(new Types.ObjectId());
    const grantB = authOf(new Types.ObjectId());
    for (let i = 0; i < NATIVE_ME_LIMIT; i++) {
      await limiter.admit(IP, T0, () => Promise.resolve(grantA));
    }

    const refused = await rejection(
      limiter.admit(IP, at(10), () => Promise.resolve(grantA)),
    );

    expect(refused).toBeInstanceOf(NativeRateLimitedError);
    expect((refused as NativeRateLimitedError).retryAfterSec).toBe(50);
    await expect(limiter.admit(IP, at(10), () => Promise.resolve(grantB))).resolves.toBe(
      grantB,
    );
  });

  it('C09: подтверждённые гранты не складываются в бюджет IP', async () => {
    const limiter = new NativeMeLimiter();
    for (let i = 0; i < NATIVE_ME_LIMIT * 3; i++) {
      const grant = authOf(new Types.ObjectId());
      await limiter.admit(IP, T0, () => Promise.resolve(grant));
    }

    await expect(
      rejection(
        limiter.admit(IP, T0, () => Promise.reject(new NativeAuthError('invalid_token'))),
      ),
    ).resolves.toEqual(new NativeAuthError('invalid_token'));
  });

  it('C12: отказы проверки считаются по IP, сверх лимита — 429; гранту за тем же IP это не мешает', async () => {
    const limiter = new NativeMeLimiter();
    const grant = authOf(new Types.ObjectId());
    const invalid = (): Promise<NativeAuthentication> =>
      Promise.reject(new NativeAuthError('invalid_token'));
    for (let i = 0; i < NATIVE_ME_LIMIT; i++) {
      expect(await rejection(limiter.admit(IP, T0, invalid))).not.toBeInstanceOf(
        NativeRateLimitedError,
      );
    }

    expect(await rejection(limiter.admit(IP, T0, invalid))).toBeInstanceOf(
      NativeRateLimitedError,
    );
    await expect(limiter.admit(IP, T0, () => Promise.resolve(grant))).resolves.toBe(
      grant,
    );
    expect(await rejection(limiter.admit('10.0.0.2', T0, invalid))).toEqual(
      new NativeAuthError('invalid_token'),
    );
  });

  it('заблокированный и лишний параметр — тоже бюджет IP', async () => {
    const limiter = new NativeMeLimiter();
    for (let i = 0; i < NATIVE_ME_LIMIT / 2; i++) {
      await rejection(
        limiter.admit(IP, T0, () =>
          Promise.reject(new NativeAuthError('account_blocked')),
        ),
      );
      await rejection(
        limiter.admit(IP, T0, () => {
          throw new NativeAuthError('invalid_request');
        }),
      );
    }

    expect(
      await rejection(
        limiter.admit(IP, T0, () =>
          Promise.reject(new NativeAuthError('account_blocked')),
        ),
      ),
    ).toBeInstanceOf(NativeRateLimitedError);
  });

  it('сбой базы бюджет не трогает и уходит как есть', async () => {
    const limiter = new NativeMeLimiter();
    const outage = Object.assign(new Error('connect ECONNREFUSED'), {
      name: 'MongoServerSelectionError',
    });
    for (let i = 0; i < NATIVE_ME_LIMIT * 2; i++) {
      expect(await rejection(limiter.admit(IP, T0, () => Promise.reject(outage)))).toBe(
        outage,
      );
    }

    expect(
      await rejection(
        limiter.admit(IP, T0, () => Promise.reject(new NativeAuthError('invalid_token'))),
      ),
    ).not.toBeInstanceOf(NativeRateLimitedError);
  });

  it('IP неизвестен — один общий бюджет на таких', async () => {
    const limiter = new NativeMeLimiter();
    const invalid = (): Promise<NativeAuthentication> =>
      Promise.reject(new NativeAuthError('invalid_token'));
    for (let i = 0; i < NATIVE_ME_LIMIT; i++)
      await rejection(limiter.admit(undefined, T0, invalid));

    expect(await rejection(limiter.admit(undefined, T0, invalid))).toBeInstanceOf(
      NativeRateLimitedError,
    );
  });
});
