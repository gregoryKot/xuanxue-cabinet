import { afterEach, describe, expect, it } from 'vitest';
import { hasActiveUploads, markUploadActive, resetActiveUploads } from './activeUploads';

afterEach(() => resetActiveUploads());

describe('activeUploads', () => {
  it('пусто — загрузок нет', () => {
    expect(hasActiveUploads()).toBe(false);
  });

  it('две загрузки: снятие одной ещё не «все закончились»', () => {
    markUploadActive('a1:q1', true);
    markUploadActive('a1:q2', true);
    markUploadActive('a1:q1', false);
    expect(hasActiveUploads()).toBe(true);
    markUploadActive('a1:q2', false);
    expect(hasActiveUploads()).toBe(false);
  });

  it('снятие незаведённого ключа — ничего не ломает', () => {
    markUploadActive('a1:q9', false);
    expect(hasActiveUploads()).toBe(false);
  });
});
