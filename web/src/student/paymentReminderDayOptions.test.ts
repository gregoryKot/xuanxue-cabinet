// Перевод выбора дня напоминания туда и обратно и подсказка под полем (ADR-0161).
import { describe, expect, it } from 'vitest';
import type { MyPaymentReminderDto } from '@xuanxue/shared';
import {
  DAY_OPTIONS,
  dayFromValue,
  NO_DAY_VALUE,
  reminderHint,
  selectedDayValue,
} from './paymentReminderDayOptions';

const NOT_CHOSEN: MyPaymentReminderDto = { dayOfMonth: null, time: '10:00' };

describe('DAY_OPTIONS', () => {
  it('первым идёт «Не напоминать», дальше числа 1–31 подряд', () => {
    expect(DAY_OPTIONS[0]).toEqual({ value: NO_DAY_VALUE, label: 'Не напоминать' });
    expect(DAY_OPTIONS).toHaveLength(32);
    expect(DAY_OPTIONS[1]).toEqual({ value: '1', label: '1-го числа' });
    expect(DAY_OPTIONS[31]).toEqual({ value: '31', label: '31-го числа' });
  });

  it('дня школы среди вариантов нет', () => {
    expect(DAY_OPTIONS.some((option) => /школ/i.test(option.label))).toBe(false);
  });
});

describe('selectedDayValue', () => {
  it('день не выбран — «Не напоминать»', () => {
    expect(selectedDayValue(NOT_CHOSEN)).toBe(NO_DAY_VALUE);
  });

  it('свой день выбран — он', () => {
    expect(selectedDayValue({ ...NOT_CHOSEN, dayOfMonth: 12 })).toBe('12');
  });
});

describe('dayFromValue', () => {
  it('пустое значение — null (снять выбор), число — число', () => {
    expect(dayFromValue(NO_DAY_VALUE)).toBeNull();
    expect(dayFromValue('31')).toBe(31);
    expect(dayFromValue('1')).toBe(1);
  });
});

describe('reminderHint', () => {
  it('день выбран — день и час выделены, про короткий месяц сказано', () => {
    expect(reminderHint({ dayOfMonth: 12, time: '10:00' })).toBe(
      'Напомним **12-го** в **10:00** по времени школы. Если в месяце нет такого числа — в последний день.',
    );
  });

  it('день не выбран — просьба выбрать, час выделен', () => {
    expect(reminderHint({ ...NOT_CHOSEN, time: '09:30' })).toBe(
      'Выберите день — напомним об оплате в **09:30** по времени школы.',
    );
  });
});
