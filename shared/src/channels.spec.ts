import { describe, expect, it } from 'vitest';
import { isTelegramChannelConfig, isVkChannelConfig } from './channels';

describe('isTelegramChannelConfig/isVkChannelConfig', () => {
  it('различает конфиг telegram по chatId', () => {
    expect(isTelegramChannelConfig({ chatId: '@school' })).toBe(true);
    expect(isVkChannelConfig({ chatId: '@school' })).toBe(false);
  });

  it('различает конфиг ВК по peerId', () => {
    expect(isVkChannelConfig({ token: 't', peerId: 1 })).toBe(true);
    expect(isTelegramChannelConfig({ token: 't', peerId: 1 })).toBe(false);
  });

  it('пустой конфиг (manual) — ни то, ни другое', () => {
    expect(isTelegramChannelConfig({})).toBe(false);
    expect(isVkChannelConfig({})).toBe(false);
  });
});
