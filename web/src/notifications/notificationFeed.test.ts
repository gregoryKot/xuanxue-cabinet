// Пояс зрителя задаётся явно, а не берётся у машины — CI гоняет vitest ещё и
// под TZ=Australia/Sydney (CLAUDE.md «Детерминизм»).
import { describe, expect, it } from 'vitest';
import type { NotificationDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { groupByDay, isUnread, notificationTimeText } from './notificationFeed';

stubViewerTimeZone();

function item(id: string, createdAt: string, readAt?: string): NotificationDto {
  return { id, kind: 'post_draft', text: `Текст ${id}`, createdAt, readAt };
}

const NOW = '2026-09-20T05:00:00.000Z'; // 08:00 в Москве (Europe/Moscow, зритель)

describe('groupByDay', () => {
  it('момент вчера по UTC, но уже сегодня в поясе читателя — рубрика «Сегодня»', () => {
    // 2026-09-19T21:30Z — это 2026-09-20T00:30 в Москве, тот же календарный
    // день, что и NOW: наивное сравнение по UTC-дате отправило бы её в «Раньше».
    const evening = item('n1', '2026-09-19T21:30:00.000Z');
    expect(groupByDay([evening], NOW)).toEqual({ today: [evening], earlier: [] });
  });

  it('момент сегодня по UTC, но уже вчера в поясе читателя — рубрика «Раньше»', () => {
    // Обратный случай: «сейчас» — 2026-09-20T23:50Z, то есть 2026-09-21T02:50
    // в Москве, а строка создана 2026-09-20T00:10Z (та же UTC-дата, что и
    // «сейчас») — но в Москве это ещё предыдущий календарный день.
    const nowLateUtc = '2026-09-20T23:50:00.000Z';
    const earlyUtcSameDate = item('n2', '2026-09-20T00:10:00.000Z');
    expect(groupByDay([earlyUtcSameDate], nowLateUtc)).toEqual({
      today: [],
      earlier: [earlyUtcSameDate],
    });
  });

  it('пустой список — обе рубрики пустые', () => {
    expect(groupByDay([], NOW)).toEqual({ today: [], earlier: [] });
  });

  it('порядок внутри рубрики — как пришёл, без пересортировки', () => {
    const first = item('a', '2026-09-20T04:50:00.000Z'); // сегодня
    const middle = item('b', '2026-09-18T10:00:00.000Z'); // раньше
    // Время у `last` раньше, чем у `first`, — если бы группа сортировалась,
    // порядок «сегодняшних» строк поменялся бы местами.
    const last = item('c', '2026-09-20T02:00:00.000Z'); // сегодня
    expect(groupByDay([first, middle, last], NOW)).toEqual({
      today: [first, last],
      earlier: [middle],
    });
  });
});

describe('notificationTimeText', () => {
  it('сегодня — только время', () => {
    expect(notificationTimeText('2026-09-20T04:50:00.000Z', NOW)).toBe('07:50');
  });

  it('раньше — дата рядом со временем', () => {
    expect(notificationTimeText('2026-09-18T10:00:00.000Z', NOW)).toBe(
      'Пт, 18 сентября, 13:00',
    );
  });
});

describe('isUnread', () => {
  it('поля readAt нет — строку ещё не открывали', () => {
    expect(isUnread(item('a', NOW))).toBe(true);
  });

  it('readAt пришёл — строка прочитана', () => {
    expect(isUnread(item('b', NOW, '2026-09-20T05:01:00.000Z'))).toBe(false);
  });
});
