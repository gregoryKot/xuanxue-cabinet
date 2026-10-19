// Варианты «За сколько напомнить» (lessonReminderOptions.ts): подписи, перевод
// значения select в изменение для `PATCH` и подсказка под полем. Чистая логика.
import { describe, expect, it } from 'vitest';
import { REMINDER_SYNC_LEAD_CHOICES } from '@xuanxue/shared';
import {
  SCHOOL_REMINDER_VALUE,
  leadChangeFromValue,
  lessonReminderHint,
  lessonReminderOptions,
  selectedReminderValue,
} from './lessonReminderOptions';

const lead = (leadMinutes: number | null, schoolMinutes: number) => ({
  leadMinutes,
  schoolMinutes,
});

describe('lessonReminderOptions', () => {
  it('«Как в школе», «В момент начала» и свои варианты по возрастанию', () => {
    expect(lessonReminderOptions(lead(null, 60))).toEqual([
      { value: '', label: 'Как в школе — за 1 час' },
      { value: '0', label: 'В момент начала' },
      { value: '15', label: 'За 15 минут' },
      { value: '30', label: 'За 30 минут' },
      { value: '60', label: 'За 1 час' },
      { value: '120', label: 'За 2 часа' },
    ]);
  });

  it('своих вариантов столько, сколько в общем списке, и порядок тот же', () => {
    const own = lessonReminderOptions(lead(null, 60)).slice(1);

    expect(own.map((option) => option.value)).toEqual(
      REMINDER_SYNC_LEAD_CHOICES.map(String),
    );
  });

  // Школьное значение учитель ставит сам — в список из пяти оно не обязано
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
    const [school, ...own] = lessonReminderOptions(lead(null, schoolMinutes));

    expect(school).toEqual({ value: SCHOOL_REMINDER_VALUE, label });
    expect(own).toHaveLength(REMINDER_SYNC_LEAD_CHOICES.length);
  });
});

describe('selectedReminderValue и leadChangeFromValue', () => {
  it('нет своего выбора — выбрано «Как в школе»', () => {
    expect(selectedReminderValue(lead(null, 60))).toBe(SCHOOL_REMINDER_VALUE);
  });

  it.each(REMINDER_SYNC_LEAD_CHOICES)(
    'свой выбор %i минут — выбран его вариант',
    (minutes) => {
      expect(selectedReminderValue(lead(minutes, 60))).toBe(String(minutes));
    },
  );

  it('«В момент начала» — это 0, а не «Как в школе»', () => {
    expect(selectedReminderValue(lead(0, 60))).toBe('0');
    expect(leadChangeFromValue('0')).toEqual({ kind: 'lead', minutes: 0 });
  });

  it('значение «Как в школе» уходит как null', () => {
    expect(leadChangeFromValue(SCHOOL_REMINDER_VALUE)).toEqual({
      kind: 'lead',
      minutes: null,
    });
  });

  it.each(REMINDER_SYNC_LEAD_CHOICES)('значение «%i» уходит числом', (minutes) => {
    expect(leadChangeFromValue(String(minutes))).toEqual({ kind: 'lead', minutes });
  });

  // Молча превратить чужое значение в «Как в школе» значило бы стереть выбор.
  it.each(['45', 'abc', '15.5', '-15', ' '])(
    'значения %j нет в списке — изменения нет',
    (value) => {
      expect(leadChangeFromValue(value)).toBeNull();
    },
  );

  it('каждый вариант списка переводится туда и обратно без потерь', () => {
    for (const option of lessonReminderOptions(lead(null, 45))) {
      const change = leadChangeFromValue(option.value);
      expect(change?.kind).toBe('lead');
      const minutes = change?.kind === 'lead' ? change.minutes : undefined;
      expect(selectedReminderValue(lead(minutes ?? null, 45))).toBe(option.value);
    }
  });
});

describe('lessonReminderHint', () => {
  it('своего выбора нет — срок школы, акцент на сроке', () => {
    expect(lessonReminderHint(lead(null, 60))).toBe(
      'Напоминание придёт за **1 час** до начала занятия.',
    );
  });

  it('школьный срок вне списка — называет его же', () => {
    expect(lessonReminderHint(lead(null, 45))).toBe(
      'Напоминание придёт за **45 минут** до начала занятия.',
    );
  });

  it('школьный срок «21 минута» — после «за» в винительном падеже', () => {
    expect(lessonReminderHint(lead(null, 21))).toBe(
      'Напоминание придёт за **21 минуту** до начала занятия.',
    );
  });

  it('свой выбор перекрывает школьный', () => {
    expect(lessonReminderHint(lead(30, 60))).toBe(
      'Напоминание придёт за **30 минут** до начала занятия.',
    );
    expect(lessonReminderHint(lead(120, 60))).toBe(
      'Напоминание придёт за **2 часа** до начала занятия.',
    );
  });

  it('ноль — «в момент начала», а не «за 0 минут» и не пустой срок', () => {
    expect(lessonReminderHint(lead(0, 60))).toBe(
      'Напоминание придёт **в момент начала** занятия.',
    );
  });
});
