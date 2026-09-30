import { describe, expect, it } from 'vitest';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { planningTzNote, ruleTzNote, scheduleTzNote, tzBadge } from './timezoneLabel';

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

  // Пояс — акцент `**жирным**` (ADR-0124): строку рисует RichText в
  // ScreenHeader.hint, здесь сверяем сырой текст формиттера с маркером.
  it('пояс школы другой — одна строка про часы школы', () => {
    expect(scheduleTzNote(['Asia/Jerusalem'], 'Europe/Moscow')).toBe(
      'Время в сетке — по часам школы (**Asia/Jerusalem**).',
    );
  });

  it('одиннадцать занятий в одном поясе — пояс назван один раз', () => {
    const tzs = Array.from({ length: 11 }, () => 'Asia/Jerusalem');

    expect(scheduleTzNote(tzs, 'Europe/Moscow')).toBe(
      'Время в сетке — по часам школы (**Asia/Jerusalem**).',
    );
  });

  it('занятий нет — подписывать нечего', () => {
    expect(scheduleTzNote([], 'Europe/Moscow')).toBeNull();
  });

  it('два разных чужих пояса — оба в строке', () => {
    expect(scheduleTzNote(['Asia/Jerusalem', 'Europe/Moscow'], 'Europe/Lisbon')).toBe(
      'Время в сетке — по часам школы (**Asia/Jerusalem, Europe/Moscow**).',
    );
  });
});

describe('planningTzNote', () => {
  it('зритель живёт по часам школы — подписи нет', () => {
    expect(planningTzNote(['Asia/Jerusalem'], 'Asia/Jerusalem')).toBeNull();
  });

  // Пояс — акцент `**жирным**` (ADR-0124), см. комментарий у scheduleTzNote выше.
  it('зритель в другом поясе — время по его часам, школа названа отдельно', () => {
    expect(planningTzNote(['Asia/Jerusalem'], 'Europe/Moscow')).toBe(
      'Время — по вашим часам. Школа живёт по **Asia/Jerusalem**.',
    );
  });
});

describe('ruleTzNote', () => {
  it('школа и зритель живут по одним часам — подписи нет', () => {
    expect(ruleTzNote(['Asia/Jerusalem'], 'Asia/Jerusalem')).toBeNull();
  });

  // Пояс — акцент `**жирным**` (ADR-0124): строку рисует RichText, здесь
  // сверяем сырой текст с маркером.
  it('пояс школы другой — одна строка про часы школы', () => {
    expect(ruleTzNote(['Asia/Jerusalem'], 'Europe/Moscow')).toBe(
      'Время — по часам школы (**Asia/Jerusalem**).',
    );
  });

  it('много занятий в одном поясе — пояс назван один раз', () => {
    expect(ruleTzNote(['Asia/Jerusalem', 'Asia/Jerusalem'], 'Europe/Moscow')).toBe(
      'Время — по часам школы (**Asia/Jerusalem**).',
    );
  });

  it('занятий нет — подписывать нечего', () => {
    expect(ruleTzNote([], 'Europe/Moscow')).toBeNull();
  });
});

describe('ruleTzNote — пояс устройства по умолчанию', () => {
  stubViewerTimeZone('Europe/Moscow');

  it('пояс зрителя не передан — сравнивается с поясом устройства', () => {
    expect(ruleTzNote(['Asia/Jerusalem'])).toBe(
      'Время — по часам школы (**Asia/Jerusalem**).',
    );
    expect(ruleTzNote(['Europe/Moscow'])).toBeNull();
  });
});
