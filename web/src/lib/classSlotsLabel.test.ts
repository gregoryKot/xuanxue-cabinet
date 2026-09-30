// Дни и время занятия по часам зрителя (lib/classSlotsLabel.ts). Пояса
// задаются явно, а не берутся у машины: CI гоняет vitest ещё и под
// TZ=Australia/Sydney (CLAUDE.md «Время»), а владелец живёт в Asia/Jerusalem.
// Даты выбраны у переходов: Сидней переводит часы вперёд 4 октября 2026,
// Израиль — назад 25 октября (там же проверено, что считается ближайшее
// занятие, а не смещение «сейчас»).
import { describe, expect, it } from 'vitest';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { classSlotsLabel } from './classSlotsLabel';

const SCHOOL_TZ = 'Asia/Jerusalem';
const SYDNEY = 'Australia/Sydney';
const MOSCOW = 'Europe/Moscow';

const slot = (weekday: number, time: string) => ({ weekday, time, durationMin: 60 });

// Среда, 30 сентября 2026: в Иерусалиме ещё лето (UTC+3), в Сиднее зима (UTC+10).
const WED_NOON_UTC = '2026-09-30T09:00:00.000Z';

describe('classSlotsLabel — дни и время', () => {
  it('зритель живёт по часам школы — время то же, дни с понедельника', () => {
    expect(
      classSlotsLabel(
        [slot(2, '10:00'), slot(1, '10:00')],
        SCHOOL_TZ,
        WED_NOON_UTC,
        SCHOOL_TZ,
      ),
    ).toBe('пн, вт · 10:00');
  });

  it('дни с одним временем склеены, разное время — отдельными частями', () => {
    expect(
      classSlotsLabel(
        [slot(5, '10:00'), slot(3, '19:00'), slot(1, '10:00')],
        SCHOOL_TZ,
        WED_NOON_UTC,
        SCHOOL_TZ,
      ),
    ).toBe('пн, пт · 10:00; ср · 19:00');
  });

  it('воскресенье встаёт в конец недели, а не в начало', () => {
    expect(
      classSlotsLabel(
        [slot(0, '10:00'), slot(1, '10:00')],
        SCHOOL_TZ,
        WED_NOON_UTC,
        SCHOOL_TZ,
      ),
    ).toBe('пн, вс · 10:00');
  });

  it('два занятия в один день — день назван дважды, по порядку времени', () => {
    expect(
      classSlotsLabel(
        [slot(1, '19:00'), slot(1, '10:00')],
        SCHOOL_TZ,
        WED_NOON_UTC,
        SCHOOL_TZ,
      ),
    ).toBe('пн · 10:00; пн · 19:00');
  });

  it('одинаковые правила не повторяются', () => {
    expect(
      classSlotsLabel(
        [slot(1, '10:00'), slot(1, '10:00')],
        SCHOOL_TZ,
        WED_NOON_UTC,
        SCHOOL_TZ,
      ),
    ).toBe('пн · 10:00');
  });

  it('полночь — «00:00», а не «24:00»', () => {
    expect(classSlotsLabel([slot(1, '00:00')], SCHOOL_TZ, WED_NOON_UTC, SCHOOL_TZ)).toBe(
      'пн · 00:00',
    );
  });

  it('занятие без правил и правила с кривым днём или временем — пустая строка', () => {
    expect(classSlotsLabel([], SCHOOL_TZ, WED_NOON_UTC, SCHOOL_TZ)).toBe('');
    expect(
      classSlotsLabel(
        [slot(9, '10:00'), slot(1, '25:99')],
        SCHOOL_TZ,
        WED_NOON_UTC,
        SCHOOL_TZ,
      ),
    ).toBe('');
  });
});

describe('classSlotsLabel — по часам зрителя', () => {
  it('зритель в Москве (UTC+3, без перевода часов) летом видит то же время, что в школе', () => {
    expect(classSlotsLabel([slot(1, '10:00')], SCHOOL_TZ, WED_NOON_UTC, MOSCOW)).toBe(
      'пн · 10:00',
    );
  });

  it('зритель в Сиднее — время по его часам: понедельник 10:00 в Иерусалиме позже в тот же день', () => {
    // 2026-10-05 10:00 в Иерусалиме (UTC+3) = 07:00 UTC; Сидней к 5 октября уже
    // перешёл на летнее время (UTC+11) — 18:00.
    expect(classSlotsLabel([slot(1, '10:00')], SCHOOL_TZ, WED_NOON_UTC, SYDNEY)).toBe(
      'пн · 18:00',
    );
  });

  it('воскресный вечер в школе — уже понедельник у зрителя: день сдвигается', () => {
    // 2026-09-27 22:00 в Иерусалиме = 19:00 UTC = понедельник 05:00 в Сиднее
    // (до его перехода на летнее время, UTC+10).
    expect(
      classSlotsLabel([slot(0, '22:00')], SCHOOL_TZ, '2026-09-24T09:00:00.000Z', SYDNEY),
    ).toBe('пн · 05:00');
  });

  it('сдвинутые дни складываются в порядок зрителя, а не школы', () => {
    // Вс 22:00 → пн 05:00; пн 22:00 → вт 05:00: у зрителя «пн, вт · 05:00».
    expect(
      classSlotsLabel(
        [slot(1, '22:00'), slot(0, '22:00')],
        SCHOOL_TZ,
        '2026-09-24T09:00:00.000Z',
        SYDNEY,
      ),
    ).toBe('пн, вт · 05:00');
  });
});

describe('classSlotsLabel — пояс устройства по умолчанию', () => {
  stubViewerTimeZone(SYDNEY);

  it('зритель в Сиднее, пояс не передан — время по часам Сиднея', () => {
    expect(classSlotsLabel([slot(1, '10:00')], SCHOOL_TZ, WED_NOON_UTC)).toBe(
      'пн · 18:00',
    );
  });
});

// Переходы считаются по ближайшему занятию, а не по смещению «сейчас»
// (CLAUDE.md «Время»: тест на переход Asia/Jerusalem обязателен).
describe('classSlotsLabel — переход летнего времени', () => {
  const monday10 = [slot(1, '10:00')];

  it('Сидней переводит часы в ночь на 4 октября: то же занятие до и после — на час разное', () => {
    // «Сейчас» — понедельник 28 сентября, 06:00 в Иерусалиме: занятие в тот же
    // день, Сидней ещё на зимнем времени (UTC+10) — 17:00.
    expect(classSlotsLabel(monday10, SCHOOL_TZ, '2026-09-28T03:00:00.000Z', SYDNEY)).toBe(
      'пн · 17:00',
    );
    // Во вторник ближайшее занятие — 5 октября, Сидней уже на UTC+11 — 18:00.
    expect(classSlotsLabel(monday10, SCHOOL_TZ, '2026-09-29T03:00:00.000Z', SYDNEY)).toBe(
      'пн · 18:00',
    );
  });

  it('Израиль переводит часы назад 25 октября: москвичу занятие уезжает на час позже', () => {
    // До перехода школа на UTC+3, как Москва: 10:00 остаётся 10:00.
    expect(classSlotsLabel(monday10, SCHOOL_TZ, '2026-10-19T03:00:00.000Z', MOSCOW)).toBe(
      'пн · 10:00',
    );
    // Во вторник 20 октября ближайшее занятие — 26-го, школа уже на UTC+2:
    // 10:00 в Иерусалиме — 11:00 в Москве.
    expect(classSlotsLabel(monday10, SCHOOL_TZ, '2026-10-20T03:00:00.000Z', MOSCOW)).toBe(
      'пн · 11:00',
    );
  });

  it('сегодняшнее занятие, которое уже началось, считается по следующей неделе', () => {
    // Понедельник 28 сентября, 11:00 в Иерусалиме — десятичасовое уже прошло.
    // Следующее — 5 октября: Сидней на UTC+11, 18:00, а не 17:00 сегодняшнего.
    expect(classSlotsLabel(monday10, SCHOOL_TZ, '2026-09-28T08:00:00.000Z', SYDNEY)).toBe(
      'пн · 18:00',
    );
  });

  it('сегодняшнее занятие, которое ещё впереди, считается по сегодняшнему дню', () => {
    expect(classSlotsLabel(monday10, SCHOOL_TZ, '2026-09-28T06:00:00.000Z', SYDNEY)).toBe(
      'пн · 17:00',
    );
  });

  it('время, которого нет в ночь перевода вперёд (пт 02:30, 27 марта 2026), не ломает подпись', () => {
    // 02:00 → 03:00 в Иерусалиме: получасовое занятие попадает в пропавший час
    // и сдвигается к ближайшему настоящему времени.
    expect(
      classSlotsLabel(
        [slot(5, '02:30')],
        SCHOOL_TZ,
        '2026-03-25T09:00:00.000Z',
        SCHOOL_TZ,
      ),
    ).toBe('пт · 03:30');
  });
});
