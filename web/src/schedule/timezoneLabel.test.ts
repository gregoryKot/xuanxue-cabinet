import { describe, expect, it } from 'vitest';
import { tzBadge } from './timezoneLabel';

describe('tzBadge', () => {
  it('совпадает с браузерным поясом — null (бейджа нет)', () => {
    expect(tzBadge('Asia/Jerusalem', 'Asia/Jerusalem')).toBeNull();
  });

  it('отличается от браузерного — возвращает пояс занятия', () => {
    expect(tzBadge('Asia/Jerusalem', 'Europe/Moscow')).toBe('Asia/Jerusalem');
  });
});
