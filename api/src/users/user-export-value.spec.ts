import { Types } from 'mongoose';
import { toExportObject, toExportValue } from './user-export-value';

describe('toExportValue', () => {
  it('ObjectId и Date становятся строками: id и ISO 8601 UTC с Z', () => {
    const id = new Types.ObjectId();

    expect(toExportValue(id)).toBe(id.toString());
    expect(toExportValue(new Date('2026-09-30T13:00:00+03:00'))).toBe(
      '2026-09-30T10:00:00.000Z',
    );
  });

  it('обходит вложенные массивы и объекты', () => {
    const id = new Types.ObjectId();

    expect(toExportValue({ list: [{ at: new Date(0), ref: id }], flag: false })).toEqual({
      list: [{ at: '1970-01-01T00:00:00.000Z', ref: id.toString() }],
      flag: false,
    });
  });

  it('пустое значение — null, а поле undefined в объекте пропадает', () => {
    expect(toExportValue(null)).toBeNull();
    expect(toExportObject({ kept: null, dropped: undefined })).toEqual({ kept: null });
  });

  it('значение, которое не переживает JSON (функция, символ), — ошибка, а не молчаливый пропуск', () => {
    expect(() => toExportValue(() => 1)).toThrow('в выгрузку не входит');
    expect(() => toExportValue(Symbol('x'))).toThrow('в выгрузку не входит');
  });
});
