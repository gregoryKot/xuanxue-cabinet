import { toIsoUtc } from './iso-date';

describe('toIsoUtc', () => {
  it('переводит Date в ISO UTC со Z', () => {
    const date = new Date(Date.UTC(2026, 8, 5, 12, 30, 0));
    expect(toIsoUtc(date)).toBe('2026-09-05T12:30:00.000Z');
  });

  it('невалидная дата — программная ошибка, не тихий null', () => {
    expect(() => toIsoUtc(new Date(NaN))).toThrow('невалидная дата');
  });
});
