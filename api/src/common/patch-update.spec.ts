import { NULLABLE_CLASS_FIELDS, NULLABLE_LESSON_FIELDS } from '@xuanxue/shared';
import { InvalidInputError } from './errors';
import { splitUpdate } from './patch-update';

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

  // Второй потребитель (lessons) — свой список nullable-полей, та же функция.
  it('работает со списком nullable-полей другого домена (lessons)', () => {
    const result = splitUpdate({ topic: 'Тема', note: null }, NULLABLE_LESSON_FIELDS);
    expect(result).toEqual({ $set: { topic: 'Тема' }, $unset: { note: '' } });
  });
});
