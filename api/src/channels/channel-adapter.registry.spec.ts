import type { ChannelAdapter } from './channel-adapter';
import { ChannelAdapterRegistry } from './channel-adapter.registry';

function fakeAdapter(type: ChannelAdapter['type']): ChannelAdapter {
  return { type, send: jest.fn() };
}

describe('ChannelAdapterRegistry', () => {
  it('get(): возвращает адаптер по типу', () => {
    const telegram = fakeAdapter('telegram');
    const registry = new ChannelAdapterRegistry([telegram, fakeAdapter('vk')]);

    expect(registry.get('telegram')).toBe(telegram);
  });

  it('get(): типа нет среди зарегистрированных — NotAvailableError (503)', () => {
    const registry = new ChannelAdapterRegistry([fakeAdapter('telegram')]);

    expect(() => registry.get('webpush')).toThrow('пока не поддерживается');
  });
});
