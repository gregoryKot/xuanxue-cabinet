import { Types } from 'mongoose';
import { targetOf, toChannelDto, type LeanChannel } from './channel.mapper';

function lean(overrides: Partial<LeanChannel> = {}): LeanChannel {
  return {
    _id: new Types.ObjectId(),
    type: 'telegram',
    title: 'Основной канал',
    active: true,
    target: '@school',
    broadcastEligible: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('targetOf', () => {
  it('telegram: chatId из config', () => {
    expect(targetOf('telegram', { chatId: '@school' })).toBe('@school');
  });

  it('vk: peerId из config, приведён к строке', () => {
    expect(targetOf('vk', { token: 't', peerId: 42 })).toBe('42');
  });

  it('manual: пустая строка', () => {
    expect(targetOf('manual', {})).toBe('');
  });

  it('telegram с чужим config (защита в глубину) — пустая строка, не падает', () => {
    expect(targetOf('telegram', {})).toBe('');
  });
});

describe('toChannelDto', () => {
  it('маппит поля, config в результате нет', () => {
    const doc = lean();
    const dto = toChannelDto(doc);

    expect(dto).toEqual({
      id: doc._id.toString(),
      type: 'telegram',
      title: 'Основной канал',
      active: true,
      target: '@school',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(dto).not.toHaveProperty('config');
  });

  it('target отсутствует в документе (запись до поля target) — пустая строка, не undefined', () => {
    const doc = lean({ target: undefined as unknown as string });
    expect(toChannelDto(doc).target).toBe('');
  });
});
