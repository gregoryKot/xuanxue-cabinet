import { describe, expect, it } from 'vitest';
import { countActiveChannels } from './channelCountLabel';

describe('countActiveChannels', () => {
  it('выключенный канал в счёт не идёт', () => {
    expect(countActiveChannels(['a', 'b'], new Set(['a']))).toBe(1);
  });

  it('ни одного активного — ноль, строка покажет «без каналов»', () => {
    expect(countActiveChannels(['a'], new Set())).toBe(0);
  });
});
