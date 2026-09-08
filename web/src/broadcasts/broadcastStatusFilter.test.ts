import { describe, expect, it } from 'vitest';
import { initialStatusFromQuery } from './broadcastStatusFilter';

describe('initialStatusFromQuery', () => {
  it('известный статус — возвращает его', () => {
    expect(initialStatusFromQuery('cancelled')).toBe('cancelled');
  });

  it('параметра нет (null) — пустая строка', () => {
    expect(initialStatusFromQuery(null)).toBe('');
  });

  it('чужое/битое значение — пустая строка, не бросает', () => {
    expect(initialStatusFromQuery('bogus')).toBe('');
    expect(initialStatusFromQuery('')).toBe('');
  });
});
