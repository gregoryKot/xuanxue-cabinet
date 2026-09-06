import { NULLABLE_CLASS_FIELDS } from '@xuanxue/shared';
import { Types } from 'mongoose';
import { InvalidInputError } from '../common/errors';
import { mapRules, ruleUniqueKey, splitUpdate } from './classes.update';

describe('splitUpdate', () => {
  it('null у nullable-поля → $unset, значение → $set, undefined — не трогаем', () => {
    const result = splitUpdate(
      {
        title: 'Новое название',
        zoomPassword: null,
        location: undefined,
      },
      NULLABLE_CLASS_FIELDS,
    );

    expect(result).toEqual({
      $set: { title: 'Новое название' },
      $unset: { zoomPassword: '' },
    });
  });

  it('пустой вход — пустые $set и $unset', () => {
    expect(splitUpdate({}, NULLABLE_CLASS_FIELDS)).toEqual({ $set: {}, $unset: {} });
  });

  it('несколько nullable-полей — все в $unset', () => {
    const result = splitUpdate(
      { zoomLink: null, zoomPassword: null, leaderId: null },
      NULLABLE_CLASS_FIELDS,
    );
    expect(result.$unset).toEqual({ zoomLink: '', zoomPassword: '', leaderId: '' });
    expect(result.$set).toEqual({});
  });

  it('null у поля вне nullableFields — InvalidInputError', () => {
    expect(() => splitUpdate({ tz: null }, NULLABLE_CLASS_FIELDS)).toThrow(
      InvalidInputError,
    );
  });

  it('пустой список nullable-полей — любой null падает', () => {
    expect(() => splitUpdate({ location: null }, [])).toThrow(InvalidInputError);
  });
});

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
