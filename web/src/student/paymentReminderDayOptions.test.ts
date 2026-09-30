// Перевод выбора дня напоминания туда и обратно (ADR-0160).
import { describe, expect, it } from 'vitest';
import type { MyPaymentReminderDto } from '@xuanxue/shared';
import {
  buildDayOptions,
  dayFromValue,
  SCHOOL_DAY_VALUE,
  selectedDayValue,
} from './paymentReminderDayOptions';

const REMINDER: MyPaymentReminderDto = {
  dayOfMonth: 5,
  isOwnDay: false,
  schoolDayOfMonth: 5,
  time: '10:00',
};

describe('buildDayOptions', () => {
  it('первым идёт «Как у школы» с днём школы, дальше числа 1–31 подряд', () => {
    const options = buildDayOptions(5);

    expect(options[0]).toEqual({ value: SCHOOL_DAY_VALUE, label: 'Как у школы — 5-го' });
    expect(options).toHaveLength(32);
    expect(options[1]).toEqual({ value: '1', label: '1-го числа' });
    expect(options[31]).toEqual({ value: '31', label: '31-го числа' });
  });

  it('день школы в подписи меняется вместе со школой', () => {
    expect(buildDayOptions(28)[0]?.label).toBe('Как у школы — 28-го');
  });
});

describe('selectedDayValue', () => {
  it('своего дня нет — «как у школы», а не число школы', () => {
    expect(selectedDayValue(REMINDER)).toBe(SCHOOL_DAY_VALUE);
  });

  it('свой день выбран — он', () => {
    expect(selectedDayValue({ ...REMINDER, dayOfMonth: 12, isOwnDay: true })).toBe('12');
  });
});

describe('dayFromValue', () => {
  it('пустое значение — null (сброс), число — число', () => {
    expect(dayFromValue(SCHOOL_DAY_VALUE)).toBeNull();
    expect(dayFromValue('31')).toBe(31);
    expect(dayFromValue('1')).toBe(1);
  });
});
