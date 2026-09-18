// Юнит-тест без Mongo и без DI (CLAUDE.md «Тесты», «Чистая логика») —
// арифметика момента отправки/рендера общая для sendLessonBroadcast и
// LessonLinkRebuildService.rebuild.
import { DateTime } from 'luxon';
import { computeBroadcastSendTiming } from './broadcast-send-timing';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('computeBroadcastSendTiming', () => {
  it('sendAt в будущем — textNow равен sendAt', () => {
    const startsAt = NOW.plus({ minutes: 40 }).toJSDate(); // 18:40
    const { sendAt, textNow } = computeBroadcastSendTiming(startsAt, 30, NOW);

    expect(sendAt.toISO()).toBe(NOW.plus({ minutes: 10 }).toISO()); // 18:10
    expect(textNow.toMillis()).toBe(sendAt.toMillis());
  });

  it('sendAt уже в прошлом (догоняющий тик/перенос на более раннее время) — textNow равен now', () => {
    const startsAt = NOW.plus({ minutes: 10 }).toJSDate(); // 18:10
    const { sendAt, textNow } = computeBroadcastSendTiming(startsAt, 30, NOW);

    expect(sendAt.toMillis()).toBeLessThan(NOW.toMillis()); // 17:40 < 18:00
    expect(textNow.toMillis()).toBe(NOW.toMillis());
  });

  it('sendAt равен now — граница включена в «уже пора», textNow равен now', () => {
    const startsAt = NOW.plus({ minutes: 30 }).toJSDate();
    const { sendAt, textNow } = computeBroadcastSendTiming(startsAt, 30, NOW);

    expect(sendAt.toMillis()).toBe(NOW.toMillis());
    expect(textNow.toMillis()).toBe(NOW.toMillis());
  });
});
