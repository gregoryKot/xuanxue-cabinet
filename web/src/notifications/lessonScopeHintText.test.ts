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

  // ADR-0168: слот раз в две недели напоминает через неделю — в среднем
  // полраза в неделю, а не раз.
  it('слот раз в две недели считается половиной, итог округляется', () => {
    const biweekly = (count: number): LessonScopeClassDto => ({
      ...makeClass(count),
      slots: makeClass(count).slots.map((slot) => ({ ...slot, everyWeeks: 2 as const })),
    });

    expect(weeklyLessonCount([makeClass(4), biweekly(2)])).toBe(5);
    expect(weeklyLessonCount([makeClass(4), biweekly(1)])).toBe(5); // 4,5 → 5
    expect(weeklyLessonCount([biweekly(3)])).toBe(2); // 1,5 → 2
  });

  it('everyWeeks: 1 — то же, что слот без поля', () => {
    const explicit: LessonScopeClassDto = {
      ...makeClass(2),
      slots: makeClass(2).slots.map((slot) => ({ ...slot, everyWeeks: 1 as const })),
    };

    expect(weeklyLessonCount([explicit])).toBe(2);
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
