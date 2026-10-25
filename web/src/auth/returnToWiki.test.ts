// Возврат из wiki (ADR-0183): какой адрес экран входа принимает, как он
// уживается с попыткой Daychi этой вкладки и что недоступное хранилище не
// роняет проверку. Рядом с returnTo.test.ts, а не в нём: тот уже за границей
// размера.
import { afterEach, describe, expect, it } from 'vitest';
import { peekNativeAttempt, saveNativeAttempt } from './nativeAttempt';
import {
  adoptLoginReturnTo,
  consumeReturnTo,
  hasPendingWikiReturn,
  isWikiEntryPath,
  postLoginPath,
  saveReturnTo,
} from './returnTo';

const ATTEMPT_ID = '0123456789abcdef01234567';
const WIKI_PATH = '/wiki?returnTo=%2Fa';
/** Адрес экрана входа, как его собирает сервер: `returnTo` — адрес входа из wiki. */
const LOGIN_SEARCH = `?returnTo=${encodeURIComponent(WIKI_PATH)}`;

afterEach(() => {
  sessionStorage.clear();
});

describe('isWikiEntryPath', () => {
  it.each(['/wiki', WIKI_PATH])('%s — адрес входа из wiki', (path) => {
    expect(isWikiEntryPath(path)).toBe(true);
  });

  it.each(['/wikipedia', '/wiki/x', '//wiki', 'https://x/wiki', '/login?x=/wiki', ''])(
    '%j — не адрес входа из wiki',
    (path) => {
      expect(isWikiEntryPath(path)).toBe(false);
    },
  );
});

describe('adoptLoginReturnTo', () => {
  it('адрес входа из wiki запоминается, и после входа ведёт на него', () => {
    adoptLoginReturnTo(LOGIN_SEARCH);

    expect(postLoginPath()).toBe(WIKI_PATH);
  });

  it('попытка Daychi этой вкладки снимается: явный путь в wiki не уводит в приложение', () => {
    saveNativeAttempt(ATTEMPT_ID);

    adoptLoginReturnTo(LOGIN_SEARCH);

    expect(peekNativeAttempt()).toBeNull();
    expect(postLoginPath()).toBe(WIKI_PATH);
  });

  it.each([
    '?returnTo=%2Fexams',
    '?returnTo=https%3A%2F%2Fevil',
    '?returnTo=%2Fwikipedia',
  ])('%s — чужой адрес игнорируется, попытка Daychi остаётся', (search) => {
    saveNativeAttempt(ATTEMPT_ID);

    adoptLoginReturnTo(search);

    expect(consumeReturnTo()).toBeNull();
    expect(peekNativeAttempt()).toBe(ATTEMPT_ID);
  });

  it.each(['', '?other=1'])('без returnTo в адресе (%j) ничего не меняется', (search) => {
    adoptLoginReturnTo(search);

    expect(consumeReturnTo()).toBeNull();
  });
});

describe('hasPendingWikiReturn', () => {
  it('без сохранённого пути — нет', () => {
    expect(hasPendingWikiReturn()).toBe(false);
  });

  it('путь в wiki ждёт возврата и не снимается проверкой', () => {
    saveReturnTo(WIKI_PATH);

    expect(hasPendingWikiReturn()).toBe(true);
    expect(hasPendingWikiReturn()).toBe(true);
    expect(consumeReturnTo()).toBe(WIKI_PATH);
    expect(hasPendingWikiReturn()).toBe(false);
  });

  it('обычный сохранённый экран — не возврат в wiki', () => {
    saveReturnTo('/exams');

    expect(hasPendingWikiReturn()).toBe(false);
  });

  it('недоступный sessionStorage — нет, без исключения', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('приватный режим: доступ запрещён');
      },
    });

    expect(hasPendingWikiReturn()).toBe(false);

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: original,
    });
  });
});
