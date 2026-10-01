// Варианты «За сколько напомнить» (lessonReminderOptions.ts): подписи, перевод
// значения select в тело запроса и подсказка под полем. Чистая логика.
import { describe, expect, it } from 'vitest';
import { LESSON_REMINDER_CHOICES, type LessonReminderDto } from '@xuanxue/shared';
import {
  SCHOOL_REMINDER_VALUE,
  lessonReminderHint,
  lessonReminderOptions,
  reminderMinutesFromValue,
  selectedReminderValue,
} from './lessonReminderOptions';

const reminder = (minutes: number | null, schoolMinutes: number): LessonReminderDto => ({
  minutes,
  schoolMinutes,
});

describe('lessonReminderOptions', () => {
  it('«Как в школе» с школьным сроком и четыре своих варианта', () => {
    expect(lessonReminderOptions(reminder(null, 60))).toEqual([
      { value: '', label: 'Как в школе — за 1 час' },
      { value: '15', label: 'За 15 минут' },
      { value: '30', label: 'За 30 минут' },
      { value: '60', label: 'За 1 час' },
      { value: '120', label: 'За 2 часа' },
    ]);
  });

  it('своих вариантов столько, сколько в общем списке, и порядок тот же', () => {
    const own = lessonReminderOptions(reminder(null, 60)).slice(1);

    expect(own.map((option) => option.value)).toEqual(
      LESSON_REMINDER_CHOICES.map(String),
    );
  });

  // Школьное значение учитель ставит сам — в список из четырёх оно не обязано
  // попадать, и подпись первого пункта всё равно должна его назвать.
  it.each([
    [45, 'Как в школе — за 45 минут'],
    [90, 'Как в школе — за 1,5 часа'],
    [180, 'Как в школе — за 3 часа'],
    // Женский род после «за»: «минута» → «минуту», а «11 минут» не меняется.
    [21, 'Как в школе — за 21 минуту'],
    [41, 'Как в школе — за 41 минуту'],
    [11, 'Как в школе — за 11 минут'],
    [5, 'Как в школе — за 5 минут'],
  ])('школьное значение %i — подпись «%s»', (schoolMinutes, label) => {
    const [school, ...own] = lessonReminderOptions(reminder(null, schoolMinutes));

    expect(school).toEqual({ value: SCHOOL_REMINDER_VALUE, label });
    expect(own).toHaveLength(LESSON_REMINDER_CHOICES.length);
  });

  it('школьное значение не подменяет свои варианты', () => {
    const labels = lessonReminderOptions(reminder(null, 45)).map(
      (option) => option.label,
    );

    expect(labels).toEqual([
      'Как в школе — за 45 минут',
      'За 15 минут',
      'За 30 минут',
      'За 1 час',
      'За 2 часа',
    ]);
  });
});

describe('selectedReminderValue и reminderMinutesFromValue', () => {
  it('нет своего выбора — выбрано «Как в школе»', () => {
    expect(selectedReminderValue(reminder(null, 60))).toBe(SCHOOL_REMINDER_VALUE);
  });

  it.each(LESSON_REMINDER_CHOICES)(
    'свой выбор %i минут — выбран его вариант',
    (minutes) => {
      expect(selectedReminderValue(reminder(minutes, 60))).toBe(String(minutes));
    },
  );

  it('значение «Как в школе» уходит на сервер как null', () => {
    expect(reminderMinutesFromValue(SCHOOL_REMINDER_VALUE)).toBeNull();
  });

  it.each(LESSON_REMINDER_CHOICES)('значение «%i» уходит числом', (minutes) => {
    expect(reminderMinutesFromValue(String(minutes))).toBe(minutes);
  });

  it('каждый вариант списка переводится туда и обратно без потерь', () => {
    for (const option of lessonReminderOptions(reminder(null, 45))) {
      const minutes = reminderMinutesFromValue(option.value);
      expect(selectedReminderValue(reminder(minutes, 45))).toBe(option.value);
    }
  });
});

describe('lessonReminderHint', () => {
  it('своего выбора нет — срок школы, акцент на сроке', () => {
    expect(lessonReminderHint(reminder(null, 60))).toBe(
      'Напоминание придёт за **1 час** до начала занятия.',
    );
  });

  it('школьный срок вне списка — называет его же', () => {
    expect(lessonReminderHint(reminder(null, 45))).toBe(
      'Напоминание придёт за **45 минут** до начала занятия.',
    );
  });

  it('школьный срок «21 минута» — после «за» в винительном падеже', () => {
    expect(lessonReminderHint(reminder(null, 21))).toBe(
      'Напоминание придёт за **21 минуту** до начала занятия.',
    );
  });

  it('свой выбор перекрывает школьный', () => {
    expect(lessonReminderHint(reminder(30, 60))).toBe(
      'Напоминание придёт за **30 минут** до начала занятия.',
    );
    expect(lessonReminderHint(reminder(120, 60))).toBe(
      'Напоминание придёт за **2 часа** до начала занятия.',
    );
  });
});
