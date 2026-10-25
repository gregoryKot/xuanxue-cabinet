import { describe, expect, it } from 'vitest';
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import { upcomingEvents } from './upcomingEvents';

const NOW = new Date('2026-11-15T12:00:00.000Z');

describe('upcomingEvents', () => {
  it('оставляет предстоящие и сортирует по возрастанию начала', () => {
    const later = makeSchoolEvent({ id: 'later', startsAt: '2026-12-20T08:00:00.000Z' });
    const sooner = makeSchoolEvent({
      id: 'sooner',
      startsAt: '2026-11-20T08:00:00.000Z',
    });

    // Штат получает список от поздних к ранним — на доске порядок обратный.
    expect(upcomingEvents([later, sooner], NOW).map((e) => e.id)).toEqual([
      'sooner',
      'later',
    ]);
  });

  it('прошедшее одноразовое событие не попадает на доску', () => {
    const past = makeSchoolEvent({ id: 'past', startsAt: '2026-11-14T08:00:00.000Z' });

    expect(upcomingEvents([past], NOW)).toEqual([]);
  });

  it('идущий многодневный ретрит остаётся до последнего дня', () => {
    const running = makeSchoolEvent({
      id: 'running',
      startsAt: '2026-11-14T08:00:00.000Z',
      endsAt: '2026-11-16T14:00:00.000Z',
    });
    const over = makeSchoolEvent({
      id: 'over',
      startsAt: '2026-11-10T08:00:00.000Z',
      endsAt: '2026-11-12T14:00:00.000Z',
    });

    expect(upcomingEvents([over, running], NOW).map((e) => e.id)).toEqual(['running']);
  });

  it('событие, начавшееся ровно сейчас, ещё идёт', () => {
    const now = makeSchoolEvent({ startsAt: NOW.toISOString() });

    expect(upcomingEvents([now], NOW)).toHaveLength(1);
  });

  it('пустой список — пустой список, исходный массив не меняется', () => {
    const a = makeSchoolEvent({ id: 'a', startsAt: '2026-12-20T08:00:00.000Z' });
    const b = makeSchoolEvent({ id: 'b', startsAt: '2026-11-20T08:00:00.000Z' });
    const source = [a, b];

    expect(upcomingEvents([], NOW)).toEqual([]);
    upcomingEvents(source, NOW);
    expect(source.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
