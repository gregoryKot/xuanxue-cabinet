// Чистая функция, без Mongo (CLAUDE.md «Тесты»): что именно апдейтит
// startPaymentWait (bot-session.service.ts).
import { DateTime } from 'luxon';
import { paymentWaitUpdate } from './payment-wait';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

describe('paymentWaitUpdate', () => {
  it('заводит ожидание с месяцем и TTL 12 часов (как у видео/текста экзамена)', () => {
    const update = paymentWaitUpdate('2026-09', NOW);

    expect(update.kind).toBe('payment');
    expect(update.month).toBe('2026-09');
    expect(update.expiresAt).toEqual(NOW.plus({ hours: 12 }).toJSDate());
  });

  it('новый вызов несёт свой месяц — старый не остаётся частично', () => {
    const first = paymentWaitUpdate('2026-08', NOW);
    const second = paymentWaitUpdate('2026-09', NOW);

    expect(first.month).toBe('2026-08');
    expect(second.month).toBe('2026-09');
  });
});
