import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissInstallCard, isInstallCardDismissed } from './installCardDismissal';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('installCardDismissal', () => {
  it('изначально не скрыта', () => {
    expect(isInstallCardDismissed()).toBe(false);
  });

  it('dismissInstallCard запоминает выбор', () => {
    dismissInstallCard();

    expect(isInstallCardDismissed()).toBe(true);
  });

  it('недоступное хранилище — не скрыта, ошибка не долетает наружу', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('приватный режим');
    });

    expect(isInstallCardDismissed()).toBe(false);
  });

  it('запись при недоступном хранилище не бросает', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('приватный режим');
    });

    expect(() => dismissInstallCard()).not.toThrow();
  });
});
