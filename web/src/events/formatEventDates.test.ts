// Пояс фиксирован явно в каждой проверке — тест не зависит от TZ раннера
// (CLAUDE.md «Детерминизм»). Последний блок читает пояс зрителя из окружения,
// как экран, под stubViewerTimeZone().
import { describe, expect, it } from 'vitest';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { formatEventDates } from './formatEventDates';

const JERUSALEM = 'Asia/Jerusalem';

describe('formatEventDates — одно время', () => {
  it('день недели, число, месяц и час', () => {
    // 14 ноября 2026 — суббота; 08:00 UTC — 10:00 в Иерусалиме (+2).
    expect(formatEventDates({ startsAt: '2026-11-14T08:00:00.000Z' }, JERUSALEM)).toBe(
      'Сб, 14 ноября, 10:00',
    );
  });

  it('день считан по часам зрителя: 22:30 UTC в Иерусалиме уже завтра', () => {
    expect(formatEventDates({ startsAt: '2026-11-14T22:30:00.000Z' }, JERUSALEM)).toBe(
      'Вс, 15 ноября, 00:30',
    );
  });
});

describe('formatEventDates — переход на зимнее время Asia/Jerusalem', () => {
  // Летнее время в Израиле кончается в последнее воскресенье октября
  // (2026-10-25): +3 до перехода, +2 после. 10:00 по часам зрителя остаются
  // 10:00 по обе стороны — сдвигается только UTC.
  it('до перехода (+3): 07:00 UTC — 10:00', () => {
    expect(formatEventDates({ startsAt: '2026-10-24T07:00:00.000Z' }, JERUSALEM)).toBe(
      'Сб, 24 октября, 10:00',
    );
  });

  it('после перехода (+2): 08:00 UTC — 10:00', () => {
    expect(formatEventDates({ startsAt: '2026-10-31T08:00:00.000Z' }, JERUSALEM)).toBe(
      'Сб, 31 октября, 10:00',
    );
  });

  it('ночь перехода: 22:30 UTC в субботу — ещё +3, уже воскресенье 01:30', () => {
    expect(formatEventDates({ startsAt: '2026-10-24T22:30:00.000Z' }, JERUSALEM)).toBe(
      'Вс, 25 октября, 01:30',
    );
  });

  it('ретрит через переход читается днями: 24–26 октября', () => {
    expect(
      formatEventDates(
        { startsAt: '2026-10-24T07:00:00.000Z', endsAt: '2026-10-26T08:00:00.000Z' },
        JERUSALEM,
      ),
    ).toBe('24–26 октября');
  });
});

describe('formatEventDates — начало и конец', () => {
  it('в один день — часы через тире', () => {
    expect(
      formatEventDates(
        { startsAt: '2026-11-14T08:00:00.000Z', endsAt: '2026-11-14T14:00:00.000Z' },
        JERUSALEM,
      ),
    ).toBe('Сб, 14 ноября, 10:00–16:00');
  });

  it('несколько дней одного месяца — «14–16 ноября»', () => {
    expect(
      formatEventDates(
        { startsAt: '2026-11-14T08:00:00.000Z', endsAt: '2026-11-16T15:00:00.000Z' },
        JERUSALEM,
      ),
    ).toBe('14–16 ноября');
  });

  it('через границу месяца — «31 октября – 2 ноября»', () => {
    expect(
      formatEventDates(
        { startsAt: '2026-10-31T08:00:00.000Z', endsAt: '2026-11-02T15:00:00.000Z' },
        JERUSALEM,
      ),
    ).toBe('31 октября – 2 ноября');
  });

  it('конец в тот же день по UTC, но на следующий по часам зрителя — два дня', () => {
    // 21:30 UTC в Иерусалиме 23:30 (+2), 22:30 UTC — уже 00:30 следующего дня.
    expect(
      formatEventDates(
        { startsAt: '2026-11-14T21:30:00.000Z', endsAt: '2026-11-14T22:30:00.000Z' },
        JERUSALEM,
      ),
    ).toBe('14–15 ноября');
  });
});

describe('formatEventDates — пояс устройства', () => {
  stubViewerTimeZone('Asia/Jerusalem');

  it('без явного пояса берёт часы зрителя', () => {
    expect(formatEventDates({ startsAt: '2026-11-14T08:00:00.000Z' })).toBe(
      'Сб, 14 ноября, 10:00',
    );
  });
});

describe('formatEventDates — другой зритель', () => {
  stubViewerTimeZone('Europe/Moscow');

  it('те же 08:00 UTC у зрителя в Москве (+3) — 11:00', () => {
    expect(formatEventDates({ startsAt: '2026-11-14T08:00:00.000Z' })).toBe(
      'Сб, 14 ноября, 11:00',
    );
  });
});
