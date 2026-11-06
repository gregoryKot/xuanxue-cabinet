// Память о ссылке-приглашении (ADR-0199) — чистая логика над localStorage,
// без DOM и сети.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetInviteCode,
  rememberInviteCode,
  rememberedInviteCode,
} from './inviteMemory';

const CODE = 'a'.repeat(32);

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('inviteMemory', () => {
  it('запомнил → прочитал → стёр', () => {
    rememberInviteCode(CODE);
    expect(rememberedInviteCode()).toBe(CODE);

    forgetInviteCode();
    expect(rememberedInviteCode()).toBeUndefined();
  });

  it('пусто — undefined, не null: значение идёт прямо в inviteCode?', () => {
    expect(rememberedInviteCode()).toBeUndefined();
  });

  it('код не по формату не запоминается, а чужое значение в ключе не читается', () => {
    rememberInviteCode('мусор');
    expect(rememberedInviteCode()).toBeUndefined();

    localStorage.setItem('xuanxue:inviteCode', 'не-код');
    expect(rememberedInviteCode()).toBeUndefined();
  });

  it('хранилище недоступно (приватный режим) — тихо ничего, экран не падает', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => rememberInviteCode(CODE)).not.toThrow();
    expect(rememberedInviteCode()).toBeUndefined();
    expect(() => forgetInviteCode()).not.toThrow();
  });
});
