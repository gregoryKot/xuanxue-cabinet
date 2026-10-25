// Ключ попытки Daychi в этой вкладке (ADR-0181): каждая ветка проверки номера
// и то, что недоступное хранилище не роняет экран входа.
import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeNativeAttempt,
  isNativeAttemptId,
  nativeContinueUrl,
  nativeLoginPath,
  peekNativeAttempt,
  saveNativeAttempt,
} from './nativeAttempt';

const ATTEMPT_ID = '0123456789abcdef01234567';

afterEach(() => {
  sessionStorage.clear();
});

describe('saveNativeAttempt / peekNativeAttempt / consumeNativeAttempt', () => {
  it('сохранённый номер читается сколько угодно раз, пока его не сняли', () => {
    saveNativeAttempt(ATTEMPT_ID);

    expect(peekNativeAttempt()).toBe(ATTEMPT_ID);
    expect(peekNativeAttempt()).toBe(ATTEMPT_ID);
  });

  it('consume отдаёт номер один раз и снимает ключ', () => {
    saveNativeAttempt(ATTEMPT_ID);

    expect(consumeNativeAttempt()).toBe(ATTEMPT_ID);
    expect(peekNativeAttempt()).toBeNull();
    expect(consumeNativeAttempt()).toBeNull();
  });

  it('новый номер заменяет прежний', () => {
    saveNativeAttempt(ATTEMPT_ID);
    saveNativeAttempt('ffffffffffffffffffffffff');

    expect(peekNativeAttempt()).toBe('ffffffffffffffffffffffff');
  });

  it.each([
    ['пустая строка', ''],
    ['23 знака', ATTEMPT_ID.slice(1)],
    ['25 знаков', `${ATTEMPT_ID}0`],
    ['заглавные буквы', ATTEMPT_ID.toUpperCase()],
    ['не hex', 'g'.repeat(24)],
    ['путь вместо номера', '/login/native?attempt=1'],
  ])('не номер (%s) не сохраняется', (_label, value) => {
    saveNativeAttempt(value);

    expect(peekNativeAttempt()).toBeNull();
  });

  it('мусор, записанный в ключ мимо saveNativeAttempt, не читается', () => {
    sessionStorage.setItem('xuanxue:nativeAttempt', '//evil.com');

    expect(peekNativeAttempt()).toBeNull();
    expect(consumeNativeAttempt()).toBeNull();
    expect(sessionStorage.getItem('xuanxue:nativeAttempt')).toBeNull();
  });

  it('недоступный sessionStorage — ни одна функция не бросает', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('приватный режим: доступ запрещён');
      },
    });

    expect(() => saveNativeAttempt(ATTEMPT_ID)).not.toThrow();
    expect(peekNativeAttempt()).toBeNull();
    expect(consumeNativeAttempt()).toBeNull();

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: original,
    });
  });
});

describe('isNativeAttemptId', () => {
  it('24 знака строчного hex — номер, null и прочее — нет', () => {
    expect(isNativeAttemptId(ATTEMPT_ID)).toBe(true);
    expect(isNativeAttemptId(null)).toBe(false);
    expect(isNativeAttemptId(`${ATTEMPT_ID} `)).toBe(false);
  });
});

describe('адреса попытки', () => {
  it('экран входа Daychi — /login/native?attempt=<номер>', () => {
    expect(nativeLoginPath(ATTEMPT_ID)).toBe(`/login/native?attempt=${ATTEMPT_ID}`);
  });

  it('continue без отмены — только attempt', () => {
    expect(nativeContinueUrl(ATTEMPT_ID)).toBe(
      `/api/auth/native/continue?attempt=${ATTEMPT_ID}`,
    );
  });

  it('continue с отменой — attempt и cancel=1', () => {
    expect(nativeContinueUrl(ATTEMPT_ID, { cancel: true })).toBe(
      `/api/auth/native/continue?attempt=${ATTEMPT_ID}&cancel=1`,
    );
  });
});
