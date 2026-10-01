import { describe, expect, it } from 'vitest';
import type { LessonScopeClassDto } from '@xuanxue/shared';
import { lessonScopeHintHeadline, weeklyLessonCount } from './lessonScopeHintText';

function makeClass(slotCount: number): LessonScopeClassDto {
  return {
    id: `c${slotCount}`,
    title: 'Тайцзи',
    groupLabel: '',
    tz: 'Asia/Jerusalem',
    slots: Array.from({ length: slotCount }, (_, index) => ({
      weekday: index % 7,
      time: '19:00',
      durationMin: 60,
    })),
  };
}

describe('weeklyLessonCount', () => {
  it('пустое расписание — ноль, а не NaN', () => {
    expect(weeklyLessonCount([])).toBe(0);
  });

  it('складывает слоты всех занятий, а не считает сами занятия', () => {
    expect(weeklyLessonCount([makeClass(2), makeClass(3), makeClass(0)])).toBe(5);
  });
});

describe('lessonScopeHintHeadline', () => {
  it.each([
    [1, '1 раз'],
    [2, '2 раза'],
    [4, '4 раза'],
    [5, '5 раз'],
    [11, '11 раз'],
    [16, '16 раз'],
    [21, '21 раз'],
    [22, '22 раза'],
  ])('%i — «%s в неделю», число выделено', (count, phrase) => {
    expect(lessonScopeHintHeadline(count)).toBe(
      `Напоминаем обо всех занятиях школы — **${phrase} в неделю**`,
    );
  });
});
