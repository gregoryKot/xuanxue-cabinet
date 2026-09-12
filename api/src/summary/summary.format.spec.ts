import { DateTime } from 'luxon';
import { formatSummary } from './summary.format';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const ZERO_COUNTS = {
  broadcastsSent: 0,
  broadcastsCancelled: 0,
  deliveriesFailed: 0,
  deliveriesPending: 0,
  manualWaiting: 0,
};

describe('formatSummary', () => {
  it('пустая база — все нули: emptyMessage, без "0/NaN/мусора" в тексте', () => {
    const result = formatSummary(ZERO_COUNTS, NOW);

    expect(result.emptyMessage).toBe(
      'Пока нечего показать: ни одной рассылки за 30 дней.',
    );
    expect(result.broadcastsSent).toBe(0);
  });

  it('период — 30 дней назад от now, до now, ISO UTC', () => {
    const result = formatSummary(ZERO_COUNTS, NOW);

    expect(result.period).toEqual({
      from: '2026-08-07T18:00:00.000Z',
      to: '2026-09-06T18:00:00.000Z',
    });
  });

  it('есть хоть один ненулевой счётчик — без emptyMessage', () => {
    const result = formatSummary({ ...ZERO_COUNTS, broadcastsSent: 1 }, NOW);

    expect(result.emptyMessage).toBeUndefined();
    expect(result.broadcastsSent).toBe(1);
  });

  it('только broadcastsCancelled ненулевой — без emptyMessage', () => {
    const result = formatSummary({ ...ZERO_COUNTS, broadcastsCancelled: 2 }, NOW);

    expect(result.emptyMessage).toBeUndefined();
    expect(result.broadcastsCancelled).toBe(2);
  });
});
