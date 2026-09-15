import { describe, expect, it } from 'vitest';
import { formatJoinedViaInviteCount } from './formatJoinedViaInviteCount';

describe('formatJoinedViaInviteCount', () => {
  it('пусто — честное «пока никто не пришёл», не «0»', () => {
    expect(formatJoinedViaInviteCount(0)).toBe('По ссылке пока никто не пришёл');
  });

  it('один человек', () => {
    expect(formatJoinedViaInviteCount(1)).toBe('По ссылке пришли: 1');
  });

  it('пять человек', () => {
    expect(formatJoinedViaInviteCount(5)).toBe('По ссылке пришли: 5');
  });
});
