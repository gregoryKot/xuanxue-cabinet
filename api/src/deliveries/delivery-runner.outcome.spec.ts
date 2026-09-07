// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import { nextDeliveryOutcome } from './delivery-runner.outcome';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('nextDeliveryOutcome', () => {
  it('sent — статус sent с sentAt и externalId', () => {
    const outcome = nextDeliveryOutcome({ status: 'sent', externalId: 'msg1' }, 0, NOW);
    expect(outcome).toEqual({
      status: 'sent',
      sentAt: NOW.toJSDate(),
      externalId: 'msg1',
    });
  });

  it('manual — статус manual, доставку завершит человек', () => {
    expect(nextDeliveryOutcome({ status: 'manual' }, 0, NOW)).toEqual({
      status: 'manual',
    });
  });

  it('первая ошибка retryable — pending, повтор через 2 минуты', () => {
    const outcome = nextDeliveryOutcome(
      { status: 'failed', error: 'таймаут', retryable: true },
      0,
      NOW,
    );
    expect(outcome).toEqual({
      status: 'pending',
      attempts: 1,
      nextAttemptAt: NOW.plus({ minutes: 2 }).toJSDate(),
      error: 'таймаут',
    });
  });

  it('вторая ошибка retryable — pending, повтор через 10 минут', () => {
    const outcome = nextDeliveryOutcome(
      { status: 'failed', error: 'таймаут', retryable: true },
      1,
      NOW,
    );
    expect(outcome).toEqual({
      status: 'pending',
      attempts: 2,
      nextAttemptAt: NOW.plus({ minutes: 10 }).toJSDate(),
      error: 'таймаут',
    });
  });

  it('третья ошибка retryable — повторы исчерпаны, failed с уведомлением', () => {
    const outcome = nextDeliveryOutcome(
      { status: 'failed', error: 'таймаут', retryable: true },
      2,
      NOW,
    );
    expect(outcome).toEqual({
      status: 'failed',
      attempts: 3,
      error: 'таймаут',
      notifyTeacher: true,
    });
  });

  it('ошибка не retryable — сразу failed с уведомлением, без повтора', () => {
    const outcome = nextDeliveryOutcome(
      { status: 'failed', error: 'чат не найден', retryable: false },
      0,
      NOW,
    );
    expect(outcome).toEqual({
      status: 'failed',
      attempts: 1,
      error: 'чат не найден',
      notifyTeacher: true,
    });
  });
});
