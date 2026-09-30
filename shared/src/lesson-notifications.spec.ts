import { describe, expect, it } from 'vitest';
import {
  effectiveReminderMinutes,
  isLessonInScope,
  LESSON_REMINDER_CHOICES,
  LESSON_SCOPE_MODES,
} from './lesson-notifications';

describe('isLessonInScope', () => {
  it('режим «все» — любое занятие, даже если список пуст', () => {
    expect(isLessonInScope({ mode: 'all', classIds: [] }, 'c1')).toBe(true);
  });

  it('режим «все» не смотрит в сохранённые галочки', () => {
    expect(isLessonInScope({ mode: 'all', classIds: ['c2'] }, 'c1')).toBe(true);
  });

  it('«выбранные» — занятие из списка проходит', () => {
    expect(isLessonInScope({ mode: 'selected', classIds: ['c1', 'c2'] }, 'c2')).toBe(
      true,
    );
  });

  it('«выбранные» — занятия вне списка нет', () => {
    expect(isLessonInScope({ mode: 'selected', classIds: ['c2'] }, 'c1')).toBe(false);
  });

  it('«выбранные» без единой галочки — ни о каких, а не «все»', () => {
    expect(isLessonInScope({ mode: 'selected', classIds: [] }, 'c1')).toBe(false);
  });

  it('режимов ровно два, дефолт «все» стоит первым', () => {
    expect(LESSON_SCOPE_MODES).toEqual(['all', 'selected']);
  });
});

describe('effectiveReminderMinutes', () => {
  it('свой выбор человека важнее школьного значения', () => {
    expect(effectiveReminderMinutes(15, 60)).toBe(15);
    expect(effectiveReminderMinutes(120, 30)).toBe(120);
  });

  it('не выбирал (нет поля или null) — значение школы', () => {
    expect(effectiveReminderMinutes(undefined, 45)).toBe(45);
    expect(effectiveReminderMinutes(null, 45)).toBe(45);
  });

  it('школьное значение не обязано быть из списка: его задаёт учитель числом', () => {
    expect(LESSON_REMINDER_CHOICES).not.toContain(45);
    expect(effectiveReminderMinutes(null, 45)).toBe(45);
  });
});

describe('LESSON_REMINDER_CHOICES', () => {
  it('четыре пункта по возрастанию: от «успеть подключиться» до «успеть доехать»', () => {
    expect(LESSON_REMINDER_CHOICES).toEqual([15, 30, 60, 120]);
  });
});
