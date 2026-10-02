import { Types } from 'mongoose';
import { InvalidInputError } from '../common/errors';
import { mapRules, ruleUniqueKey } from './classes.update';

describe('mapRules', () => {
  it('undefined — не трогаем массив правил вовсе', () => {
    expect(mapRules(undefined)).toBeUndefined();
  });

  it('правило с id сохраняет его как _id', () => {
    const id = new Types.ObjectId().toString();
    const [mapped] = mapRules([{ id, weekday: 1, time: '19:00', durationMin: 60 }]) ?? [];

    expect(mapped?._id.toString()).toBe(id);
    expect(mapped).toMatchObject({ weekday: 1, time: '19:00', durationMin: 60 });
  });

  it('правило без id получает новый _id', () => {
    const [first] = mapRules([{ weekday: 2, time: '10:00', durationMin: 30 }]) ?? [];
    const [second] = mapRules([{ weekday: 2, time: '10:00', durationMin: 30 }]) ?? [];

    expect(first?._id).toBeInstanceOf(Types.ObjectId);
    expect(first?._id.toString()).not.toBe(second?._id.toString());
  });

  it('пустой массив — пустой массив, не undefined', () => {
    expect(mapRules([])).toEqual([]);
  });
});

describe('mapRules — раз в две недели (ADR-0168)', () => {
  const FRIDAY = { weekday: 5 as const, time: '20:00', durationMin: 90 };

  it('раз в две недели с датой на день правила — оба поля сохраняются', () => {
    const [mapped] =
      mapRules([{ ...FRIDAY, everyWeeks: 2, startsOn: '2026-10-02' }]) ?? [];

    expect(mapped).toMatchObject({ everyWeeks: 2, startsOn: '2026-10-02' });
  });

  it('каждую неделю: everyWeeks: 1 и лишняя дата не сохраняются — одно представление «каждую неделю»', () => {
    const [mapped] =
      mapRules([{ ...FRIDAY, everyWeeks: 1, startsOn: '2026-10-02' }]) ?? [];

    expect(mapped).not.toHaveProperty('everyWeeks');
    expect(mapped).not.toHaveProperty('startsOn');
  });

  it('правило без полей остаётся еженедельным, как до ADR-0168', () => {
    const [mapped] = mapRules([FRIDAY]) ?? [];

    expect(mapped).toMatchObject(FRIDAY);
    expect(mapped).not.toHaveProperty('everyWeeks');
  });

  it('без даты — доменная ошибка 400 с номером правила и действием', () => {
    const call = () =>
      mapRules([
        { weekday: 1, time: '19:00', durationMin: 60 },
        { ...FRIDAY, everyWeeks: 2 },
      ]);

    expect(call).toThrow(InvalidInputError);
    expect(call).toThrow(
      'Правило 2: Впишите дату первого занятия: от неё занятие идёт через неделю.',
    );
  });

  it('дата в другой день недели — ошибка называет оба дня', () => {
    expect(() =>
      mapRules([{ ...FRIDAY, everyWeeks: 2, startsOn: '2026-10-03' }]),
    ).toThrow(
      'Правило 1: Дата первого занятия выпадает на субботу, а правило стоит на пятницу. Выберите пятницу.',
    );
  });

  it('невозможная дата (31 апреля) — ошибка, а не соседний день', () => {
    expect(() =>
      mapRules([{ ...FRIDAY, everyWeeks: 2, startsOn: '2026-04-31' }]),
    ).toThrow(
      'Правило 1: Дата первого занятия указана неверно. Выберите её в календаре.',
    );
  });
});

describe('ruleUniqueKey', () => {
  it('правило с id — ключ это id', () => {
    const rule = { id: 'abc', weekday: 1 as const, time: '19:00', durationMin: 60 };
    expect(ruleUniqueKey(rule)).toBe('abc');
  });

  it('правило без id — разный ключ на каждый вызов (новые правила не дублируют друг друга)', () => {
    const rule = { weekday: 1 as const, time: '19:00', durationMin: 60 };
    expect(ruleUniqueKey(rule)).not.toBe(ruleUniqueKey(rule));
  });
});
