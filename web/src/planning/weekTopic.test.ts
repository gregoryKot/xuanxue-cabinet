import { describe, expect, it } from 'vitest';
import { makeLesson } from '../test-support/planningFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { groupLessonsByDay } from './groupLessonsByDay';
import {
  groupDayGroupsByWeek,
  weekKeyOf,
  weekTopicDraft,
  weekTopicSummary,
} from './weekTopic';

stubViewerTimeZone('Asia/Jerusalem');

// 8 ноября 2026 — воскресенье.
const TUE = '2026-11-10T17:00:00.000Z';
const WED = '2026-11-11T17:00:00.000Z';
const THU = '2026-11-12T17:00:00.000Z';

describe('weekKeyOf', () => {
  it('ключ — воскресенье недели в поясе зрителя', () => {
    expect(weekKeyOf(TUE)).toBe('2026-11-08');
    expect(weekKeyOf('2026-11-08T10:00:00.000Z')).toBe('2026-11-08');
  });

  it('суббота 23:30 — прошлая неделя, воскресенье 00:30 — новая', () => {
    // Зима: Иерусалим UTC+2.
    expect(weekKeyOf('2026-11-14T21:30:00.000Z')).toBe('2026-11-08');
    expect(weekKeyOf('2026-11-14T22:30:00.000Z')).toBe('2026-11-15');
  });
});

describe('groupDayGroupsByWeek', () => {
  it('день без занятий недели не образует', () => {
    expect(
      groupDayGroupsByWeek([
        { key: '2026-11-10', heading: 'Вт, 10 ноября', lessons: [] },
      ]),
    ).toEqual([]);
  });

  it('собирает дни в недели, заголовок — по воскресенью', () => {
    const lessons = [
      makeLesson({ id: 'a', startsAt: TUE }),
      makeLesson({ id: 'b', startsAt: THU }),
      makeLesson({ id: 'c', startsAt: '2026-11-17T17:00:00.000Z' }),
    ];
    const weeks = groupDayGroupsByWeek(groupLessonsByDay(lessons));
    expect(weeks.map((w) => w.key)).toEqual(['2026-11-08', '2026-11-15']);
    expect(weeks[0]?.heading).toBe('Неделя с 8 ноября');
    expect(weeks[0]?.days).toHaveLength(2);
    expect(weeks[0]?.lessons.map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('weekTopicSummary', () => {
  it('пустая неделя и неделя из одних отменённых — null', () => {
    expect(weekTopicSummary([])).toBeNull();
    expect(
      weekTopicSummary([makeLesson({ status: 'cancelled', topic: 'х' })]),
    ).toBeNull();
  });

  it('темы нет ни у кого', () => {
    expect(weekTopicSummary([makeLesson()])).toBe('Тема недели не задана');
  });

  it('одна тема у всех', () => {
    const lessons = [
      makeLesson({ id: 'a', startsAt: TUE, topic: 'Шаги назад' }),
      makeLesson({ id: 'b', startsAt: WED, topic: 'Шаги назад' }),
    ];
    expect(weekTopicSummary(lessons)).toBe(
      'Тема недели: **Шаги назад** · 2 из 2 занятий',
    );
  });

  it('две темы: побеждает частая; склонение «занятия»', () => {
    const lessons = [
      makeLesson({ id: 'a', startsAt: TUE, topic: 'А' }),
      makeLesson({ id: 'b', startsAt: WED, topic: 'Б' }),
      makeLesson({ id: 'c', startsAt: THU, topic: 'Б' }),
    ];
    expect(weekTopicSummary(lessons)).toBe('Тема недели: **Б** · 2 из 3 занятий');
  });

  it('при равенстве — тема раньше по времени; отменённые не считаются', () => {
    const lessons = [
      makeLesson({ id: 'b', startsAt: WED, topic: 'Б' }),
      makeLesson({ id: 'a', startsAt: TUE, topic: 'А' }),
      makeLesson({ id: 'x', startsAt: THU, topic: 'Б', status: 'cancelled' }),
    ];
    expect(weekTopicSummary(lessons)).toBe('Тема недели: **А** · 1 из 2 занятий');
  });
});

describe('weekTopicDraft', () => {
  it('темы нет — пустое поле, отмечены неотменённые занятия', () => {
    const lessons = [
      makeLesson({ id: 'a', startsAt: TUE }),
      makeLesson({ id: 'b', startsAt: WED, status: 'cancelled' }),
      makeLesson({ id: 'c', startsAt: THU }),
    ];
    expect(weekTopicDraft(lessons)).toEqual({ topic: '', selectedIds: ['a', 'c'] });
  });

  it('тема есть — она в поле, отмечены занятия с ней', () => {
    const lessons = [
      makeLesson({ id: 'a', startsAt: TUE, topic: 'Шаги' }),
      makeLesson({ id: 'b', startsAt: WED }),
      makeLesson({ id: 'c', startsAt: THU, topic: 'Шаги', status: 'cancelled' }),
    ];
    expect(weekTopicDraft(lessons)).toEqual({ topic: 'Шаги', selectedIds: ['a'] });
  });
});
