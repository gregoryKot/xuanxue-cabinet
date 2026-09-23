import { describe, expect, it } from 'vitest';
import { formatExamDueAt } from './exam-due-line';

describe('formatExamDueAt', () => {
  it('срока нет — null, строки не будет вовсе', () => {
    expect(formatExamDueAt(undefined, { timeZone: 'Asia/Jerusalem' })).toBeNull();
  });

  it('дата нечитаемая — null, не «Invalid Date»', () => {
    expect(formatExamDueAt('не дата', { timeZone: 'Asia/Jerusalem' })).toBeNull();
  });

  it('без пояса и приписки — только дата и час', () => {
    expect(formatExamDueAt('2026-09-30T20:59:00Z', { timeZone: 'Asia/Jerusalem' })).toBe(
      '30 сентября, 23:59',
    );
  });

  it('с приписной пояса — добавляется в скобках следом', () => {
    expect(
      formatExamDueAt('2026-09-30T20:59:00Z', {
        timeZone: 'Asia/Jerusalem',
        zoneNote: '(Asia/Jerusalem)',
      }),
    ).toBe('30 сентября, 23:59 (Asia/Jerusalem)');
  });

  it('без пояса вовсе — Intl берёт системный, час не падает и не пустой', () => {
    expect(formatExamDueAt('2026-09-30T20:59:00Z')).toMatch(/30 сентября, \d{2}:\d{2}/);
  });

  // CLAUDE.md «Время»: переход летнего времени Asia/Jerusalem обязателен для
  // кода, который считает дату. Функция сама арифметики не делает (готовый
  // момент → Intl), но обязана читать смещение по эту и по ту сторону
  // перехода одинаково честно, не «на глаз» по UTC-часу.
  it('переход на зимнее время Asia/Jerusalem — час читается по местному смещению по обе стороны границы', () => {
    // 2026-10-24T21:00:00Z — ещё летнее время (+03:00): 25 октября, 00:00 по месту.
    expect(formatExamDueAt('2026-10-24T21:00:00Z', { timeZone: 'Asia/Jerusalem' })).toBe(
      '25 октября, 00:00',
    );
    // 2026-10-26T21:00:00Z — уже зимнее время (+02:00): 26 октября, 23:00.
    expect(formatExamDueAt('2026-10-26T21:00:00Z', { timeZone: 'Asia/Jerusalem' })).toBe(
      '26 октября, 23:00',
    );
  });
});
