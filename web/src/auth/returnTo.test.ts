// Аудит L2 (docs/audits/2026-09-12-quality-audit.md): проверяем каждую
// ветку валидации и то, что недоступное хранилище не роняет вызывающий код.
import { afterEach, describe, expect, it } from 'vitest';
import { consumeReturnTo, postLoginPath, saveReturnTo } from './returnTo';

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
