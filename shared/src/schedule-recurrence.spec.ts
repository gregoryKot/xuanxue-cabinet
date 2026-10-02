// Календарная дата без пояса и проверка пары everyWeeks/startsOn (ADR-0168).
// Даты в тестах — только строками «ГГГГ-ММ-ДД»: пояс процесса ни на что не
// влияет, CI гоняет vitest и под TZ=Australia/Sydney.
import { describe, expect, it } from 'vitest';
import { WEEKDAYS } from './domain';
import {
  EVERY_WEEKS_LABELS_RU,
  RULE_DATE_RE,
  WEEKDAY_ACCUSATIVE_RU,
  ruleRecurrenceError,
  weekdayOfDate,
} from './schedule-recurrence';

const FRIDAY = 5;
const SATURDAY = 6;

describe('weekdayOfDate', () => {
  it('пятница 2026-10-02 — 5, первое занятие для преподавателей', () => {
    expect(weekdayOfDate('2026-10-02')).toBe(FRIDAY);
  });

  it('воскресенье — 0, а не 7: нумерация школы, как у weekday правила', () => {
    expect(weekdayOfDate('2026-10-04')).toBe(0);
  });

  it('неделя целиком: с воскресенья 2026-10-04 идут все семь дней по порядку', () => {
    const week = ['04', '05', '06', '07', '08', '09', '10'];
    expect(week.map((day) => weekdayOfDate(`2026-10-${day}`))).toEqual([...WEEKDAYS]);
  });

  it('переход летнего времени не двигает день: 2026-10-25 (смена часов в Израиле) — воскресенье', () => {
    expect(weekdayOfDate('2026-10-25')).toBe(0);
    expect(weekdayOfDate('2026-03-27')).toBe(FRIDAY);
  });

  it('високосный день: 2028-02-29 — вторник', () => {
    expect(weekdayOfDate('2028-02-29')).toBe(2);
  });

  it('даты, которой нет в календаре, — null, а не соседний день', () => {
    expect(weekdayOfDate('2026-04-31')).toBeNull();
    expect(weekdayOfDate('2026-02-29')).toBeNull();
    expect(weekdayOfDate('2026-02-30')).toBeNull();
  });

  it('год из четырёх цифр: 0050-01-01 не превращается в 1950-й', () => {
    expect(weekdayOfDate('0050-01-01')).toBeNull();
  });

  it('не тот формат — null', () => {
    for (const bad of ['', '2026-10-2', '02.10.2026', '2026-13-01', '2026-00-10']) {
      expect(weekdayOfDate(bad)).toBeNull();
    }
  });
});

describe('RULE_DATE_RE', () => {
  it('пропускает формат <input type="date">, не пропускает время и мусор', () => {
    expect(RULE_DATE_RE.test('2026-10-02')).toBe(true);
    expect(RULE_DATE_RE.test('2026-10-02T00:00')).toBe(false);
    expect(RULE_DATE_RE.test(' 2026-10-02')).toBe(false);
  });
});

describe('ruleRecurrenceError', () => {
  it('еженедельное правило — всё в порядке, дату не смотрим', () => {
    expect(ruleRecurrenceError({ weekday: FRIDAY })).toBeNull();
    expect(
      ruleRecurrenceError({ weekday: FRIDAY, everyWeeks: 1, startsOn: 'мусор' }),
    ).toBeNull();
  });

  it('раз в две недели с датой на день правила — всё в порядке', () => {
    expect(
      ruleRecurrenceError({ weekday: FRIDAY, everyWeeks: 2, startsOn: '2026-10-02' }),
    ).toBeNull();
  });

  it('раз в две недели без даты — просит дату, пустая строка то же', () => {
    const expected = 'Впишите дату первого занятия: от неё занятие идёт через неделю.';
    expect(ruleRecurrenceError({ weekday: FRIDAY, everyWeeks: 2 })).toBe(expected);
    expect(ruleRecurrenceError({ weekday: FRIDAY, everyWeeks: 2, startsOn: '' })).toBe(
      expected,
    );
  });

  it('дата не из календаря или в другом формате — «указана неверно»', () => {
    const expected = 'Дата первого занятия указана неверно. Выберите её в календаре.';
    expect(
      ruleRecurrenceError({ weekday: FRIDAY, everyWeeks: 2, startsOn: '2026-04-31' }),
    ).toBe(expected);
    expect(
      ruleRecurrenceError({ weekday: FRIDAY, everyWeeks: 2, startsOn: '02.10.2026' }),
    ).toBe(expected);
  });

  it('дата в другой день недели — называет оба дня и что выбрать', () => {
    expect(
      ruleRecurrenceError({ weekday: FRIDAY, everyWeeks: 2, startsOn: '2026-10-03' }),
    ).toBe(
      'Дата первого занятия выпадает на субботу, а правило стоит на пятницу. Выберите пятницу.',
    );
  });
});

describe('подписи', () => {
  it('у каждого дня есть форма «на …», у выбора «как часто» — оба пункта', () => {
    expect(Object.keys(WEEKDAY_ACCUSATIVE_RU)).toHaveLength(7);
    expect(WEEKDAY_ACCUSATIVE_RU[SATURDAY]).toBe('субботу');
    expect(EVERY_WEEKS_LABELS_RU).toEqual({ 1: 'Каждую неделю', 2: 'Раз в две недели' });
  });
});
