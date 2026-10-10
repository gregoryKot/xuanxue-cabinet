// Аудит L2 (docs/audits/2026-09-12-quality-audit.md): проверяем каждую
// ветку валидации и то, что недоступное хранилище не роняет вызывающий код.
import { afterEach, describe, expect, it } from 'vitest';
import { consumeNativeAttempt, saveNativeAttempt } from './nativeAttempt';
import { consumeReturnTo, loginPath, postLoginPath, saveReturnTo } from './returnTo';

const ATTEMPT_ID = '0123456789abcdef01234567';

afterEach(() => {
  sessionStorage.clear();
});

describe('saveReturnTo / consumeReturnTo', () => {
  it('сохранённый путь читается один раз, второе чтение — пусто', () => {
    saveReturnTo('/exams');

    expect(consumeReturnTo()).toBe('/exams');
    expect(consumeReturnTo()).toBeNull();
  });

  it('путь с query сохраняется целиком', () => {
    saveReturnTo('/planning?week=2');

    expect(consumeReturnTo()).toBe('/planning?week=2');
  });

  it('без сохранения — consumeReturnTo пуст', () => {
    expect(consumeReturnTo()).toBeNull();
  });

  it('внешний адрес //evil.com отклонён', () => {
    saveReturnTo('//evil.com');

    expect(consumeReturnTo()).toBeNull();
  });

  it('обратный слэш /\\evil.com отклонён', () => {
    saveReturnTo('/\\evil.com');

    expect(consumeReturnTo()).toBeNull();
  });

  it('абсолютный URL https://evil.com отклонён (не начинается с /)', () => {
    saveReturnTo('https://evil.com');

    expect(consumeReturnTo()).toBeNull();
  });

  it('/login отклонён — иначе после входа вернёмся на экран входа', () => {
    saveReturnTo('/login');

    expect(consumeReturnTo()).toBeNull();
  });

  it('/login/email отклонён тем же правилом', () => {
    saveReturnTo('/login/email?token=abc');

    expect(consumeReturnTo()).toBeNull();
  });

  it('недоступный sessionStorage — сохранение и чтение не бросают', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('приватный режим: доступ запрещён');
      },
    });

    expect(() => saveReturnTo('/exams')).not.toThrow();
    expect(consumeReturnTo()).toBeNull();

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: original,
    });
  });
});

describe('postLoginPath', () => {
  it('без сохранённого адреса — домашний экран', () => {
    expect(postLoginPath()).toBe('/');
  });

  it('с сохранённым адресом — он, и только один раз', () => {
    saveReturnTo('/exams');

    expect(postLoginPath()).toBe('/exams');
    expect(postLoginPath()).toBe('/');
  });

  // ADR-0181: вход, начатый из Daychi, возвращается на его экран, а не на
  // сохранённый экран кабинета; returnTo при этом остаётся на потом.
  it('попытка Daychi во вкладке — её экран, раньше returnTo и домашнего', () => {
    saveReturnTo('/exams');
    saveNativeAttempt(ATTEMPT_ID);

    expect(postLoginPath()).toBe(`/login/native?attempt=${ATTEMPT_ID}`);
    expect(postLoginPath()).toBe(`/login/native?attempt=${ATTEMPT_ID}`);

    consumeNativeAttempt();
    expect(postLoginPath()).toBe('/exams');
  });

  it('попытка Daychi без returnTo — её экран, не домашний', () => {
    saveNativeAttempt(ATTEMPT_ID);

    expect(postLoginPath()).toBe(`/login/native?attempt=${ATTEMPT_ID}`);
  });

  // N17 профиля: ключ попытки — своя ветка, returnTo экран входа по-прежнему
  // не пускает, в том числе сам экран Daychi.
  it('returnTo не пускает /login/native — попытка живёт только своим ключом', () => {
    saveReturnTo(`/login/native?attempt=${ATTEMPT_ID}`);

    expect(postLoginPath()).toBe('/');
  });
});

describe('loginPath', () => {
  it('без попытки Daychi — обычный экран входа', () => {
    expect(loginPath()).toBe('/login');
  });

  it('попытка Daychi во вкладке — её экран; ключ не снимается', () => {
    saveNativeAttempt(ATTEMPT_ID);

    expect(loginPath()).toBe(`/login/native?attempt=${ATTEMPT_ID}`);
    expect(loginPath()).toBe(`/login/native?attempt=${ATTEMPT_ID}`);
  });
});

describe('saveReturnTo — пустые и мусорные значения', () => {
  it('пустая строка не сохраняется', () => {
    saveReturnTo('');

    expect(consumeReturnTo()).toBeNull();
  });

  it('относительный путь без ведущего слэша отклонён', () => {
    saveReturnTo('exams');

    expect(consumeReturnTo()).toBeNull();
  });
});
