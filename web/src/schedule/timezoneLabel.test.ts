import { describe, expect, it } from 'vitest';
import { planningTzNote, scheduleTzNote, tzBadge } from './timezoneLabel';

describe('tzBadge', () => {
  it('совпадает с браузерным поясом — null (бейджа нет)', () => {
    expect(tzBadge('Asia/Jerusalem', 'Asia/Jerusalem')).toBeNull();
  });

  it('отличается от браузерного — возвращает пояс занятия', () => {
    expect(tzBadge('Asia/Jerusalem', 'Europe/Moscow')).toBe('Asia/Jerusalem');
  });
});

describe('scheduleTzNote', () => {
  it('пояс школы совпадает с поясом зрителя — подписи нет', () => {
    expect(scheduleTzNote(['Asia/Jerusalem'], 'Asia/Jerusalem')).toBeNull();
  });

  it('пояс школы другой — одна строка про часы школы', () => {
    expect(scheduleTzNote(['Asia/Jerusalem'], 'Europe/Moscow')).toBe(
      'Время в сетке — по часам школы (Asia/Jerusalem).',
    );
  });

  it('одиннадцать занятий в одном поясе — пояс назван один раз', () => {
    const tzs = Array.from({ length: 11 }, () => 'Asia/Jerusalem');

    expect(scheduleTzNote(tzs, 'Europe/Moscow')).toBe(
      'Время в сетке — по часам школы (Asia/Jerusalem).',
    );
  });

  it('занятий нет — подписывать нечего', () => {
    expect(scheduleTzNote([], 'Europe/Moscow')).toBeNull();
  });

  it('два разных чужих пояса — оба в строке', () => {
    expect(scheduleTzNote(['Asia/Jerusalem', 'Europe/Moscow'], 'Europe/Lisbon')).toBe(
      'Время в сетке — по часам школы (Asia/Jerusalem, Europe/Moscow).',
    );
  });
});

describe('planningTzNote', () => {
  it('зритель живёт по часам школы — подписи нет', () => {
    expect(planningTzNote(['Asia/Jerusalem'], 'Asia/Jerusalem')).toBeNull();
  });

  it('зритель в другом поясе — время по его часам, школа названа отдельно', () => {
    expect(planningTzNote(['Asia/Jerusalem'], 'Europe/Moscow')).toBe(
      'Время — по вашим часам. Школа живёт по Asia/Jerusalem.',
    );
  });
});
