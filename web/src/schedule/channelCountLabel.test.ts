import { describe, expect, it } from 'vitest';
import { formatChannelCount } from './channelCountLabel';

describe('formatChannelCount', () => {
  it('0 — «без каналов», не «0 каналов»', () => {
    expect(formatChannelCount(0)).toBe('без каналов');
  });

  it('1 — «1 канал»', () => {
    expect(formatChannelCount(1)).toBe('1 канал');
  });

  it('2 — «2 канала»', () => {
    expect(formatChannelCount(2)).toBe('2 канала');
  });

  it('5 — «5 каналов»', () => {
    expect(formatChannelCount(5)).toBe('5 каналов');
  });
});
