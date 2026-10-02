// Правило расписания в форме занятия (ADR-0168): черновик из ответа сервера,
// проверка и тело запроса. Даты — только строками «ГГГГ-ММ-ДД»: пояс браузера
// здесь ни при чём, vitest гоняется и под TZ=Australia/Sydney.
import { describe, expect, it } from 'vitest';
import type { ScheduleRuleDto } from '@xuanxue/shared';
import {
  draftsToRules,
  newRuleDraft,
  ruleToDraft,
  validateRuleDrafts,
  type RuleDraft,
} from './ruleDraft';

const FRIDAY = 5;

function draft(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return {
    weekday: FRIDAY,
    time: '20:00',
    durationMinText: '90',
    everyWeeks: 1,
    startsOn: '',
    ...overrides,
  };
}

describe('newRuleDraft', () => {
  it('новая строка — воскресенье 19:00 на 60 минут, каждую неделю, без даты', () => {
    expect(newRuleDraft()).toEqual({
      weekday: 0,
      time: '19:00',
      durationMinText: '60',
      everyWeeks: 1,
      startsOn: '',
    });
  });

  it('каждый вызов — новый объект: правка одной строки не меняет другую', () => {
    expect(newRuleDraft()).not.toBe(newRuleDraft());
  });
});

describe('ruleToDraft', () => {
  it('правило раз в две недели — частота и дата переносятся, длительность строкой', () => {
    const rule: ScheduleRuleDto = {
      id: 'r1',
      weekday: FRIDAY,
      time: '20:00',
      durationMin: 90,
      everyWeeks: 2,
      startsOn: '2026-10-02',
    };

    expect(ruleToDraft(rule)).toEqual({
      id: 'r1',
      weekday: FRIDAY,
      time: '20:00',
      durationMinText: '90',
      everyWeeks: 2,
      startsOn: '2026-10-02',
    });
  });

  it('правило без полей (занятие до ADR-0168) — каждую неделю, дата пустая, не undefined', () => {
    const rule: ScheduleRuleDto = {
      id: 'r2',
      weekday: 1,
      time: '19:00',
      durationMin: 60,
    };

    expect(ruleToDraft(rule)).toMatchObject({ everyWeeks: 1, startsOn: '' });
  });
});

// Черновик формы лежит в localStorage до 7 суток (ADR-0052): строка правила,
// записанная до ADR-0168, полей `everyWeeks`/`startsOn` не содержит вовсе.
describe('строка правила из старого черновика (без everyWeeks и startsOn)', () => {
  const legacy: RuleDraft = {
    weekday: FRIDAY,
    time: '20:00',
    durationMinText: '90',
  };

  it('проверка проходит, правило — еженедельное', () => {
    expect(validateRuleDrafts([legacy])).toBeNull();
  });

  it('в тело уходит без everyWeeks и даты', () => {
    const [rule] = draftsToRules([legacy]);

    expect(rule).not.toHaveProperty('everyWeeks');
    expect(rule).not.toHaveProperty('startsOn');
  });
});

describe('validateRuleDrafts', () => {
  it('еженедельные правила в порядке — null; дата у них не проверяется', () => {
    expect(validateRuleDrafts([draft(), draft({ startsOn: 'мусор' })])).toBeNull();
  });

  it('раз в две недели с датой на день правила — null', () => {
    expect(
      validateRuleDrafts([draft({ everyWeeks: 2, startsOn: '2026-10-02' })]),
    ).toBeNull();
  });

  it('время не выбрано — просит время', () => {
    expect(validateRuleDrafts([draft({ time: '' })])).toBe(
      'Выберите время для каждого дня.',
    );
  });

  it('длительность не число и вне границ — называет границы', () => {
    const expected = 'Длительность — целое число от 5 до 600 минут.';
    expect(validateRuleDrafts([draft({ durationMinText: '' })])).toBe(expected);
    expect(validateRuleDrafts([draft({ durationMinText: '1' })])).toBe(expected);
  });

  it('раз в две недели без даты — просит дату', () => {
    expect(validateRuleDrafts([draft({ everyWeeks: 2 })])).toBe(
      'Впишите дату первого занятия: от неё занятие идёт через неделю.',
    );
  });

  it('дата в другой день недели — называет оба дня и что выбрать', () => {
    expect(validateRuleDrafts([draft({ everyWeeks: 2, startsOn: '2026-10-03' })])).toBe(
      'Дата первого занятия выпадает на субботу, а правило стоит на пятницу. Выберите пятницу.',
    );
  });

  it('несколько правил: ошибка названа днём и временем строки, где она', () => {
    const error = validateRuleDrafts([
      draft({ weekday: 2, time: '19:00' }),
      draft({ everyWeeks: 2 }),
    ]);

    expect(error).toBe(
      'Пт 20:00: Впишите дату первого занятия: от неё занятие идёт через неделю.',
    );
  });

  it('несколько правил, время ещё не выбрано — в названии только день', () => {
    expect(validateRuleDrafts([draft(), draft({ weekday: 3, time: '' })])).toBe(
      'Ср: Выберите время для каждого дня.',
    );
  });

  it('первая ошибка важнее остальных: время раньше даты', () => {
    expect(validateRuleDrafts([draft({ time: '', everyWeeks: 2 })])).toBe(
      'Выберите время для каждого дня.',
    );
  });
});

describe('draftsToRules', () => {
  it('раз в две недели — everyWeeks и дата уходят в тело, длительность числом', () => {
    expect(
      draftsToRules([draft({ id: 'r1', everyWeeks: 2, startsOn: '2026-10-02' })]),
    ).toEqual([
      {
        id: 'r1',
        weekday: FRIDAY,
        time: '20:00',
        durationMin: 90,
        everyWeeks: 2,
        startsOn: '2026-10-02',
      },
    ]);
  });

  it('каждую неделю — ни everyWeeks, ни даты в теле, даже если дата осталась от прошлого выбора', () => {
    const [rule] = draftsToRules([draft({ everyWeeks: 1, startsOn: '2026-10-02' })]);

    expect(rule).not.toHaveProperty('everyWeeks');
    expect(rule).not.toHaveProperty('startsOn');
    expect(rule).toMatchObject({ weekday: FRIDAY, time: '20:00', durationMin: 90 });
  });
});
