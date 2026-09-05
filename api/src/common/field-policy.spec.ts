import { enc, encJson, plain, encryptSchemaFrom, type FieldPolicy } from './field-policy';

describe('field-policy', () => {
  it('plain() возвращает решение с причиной', () => {
    expect(plain('тестовая причина')).toEqual({
      policy: 'plain',
      reason: 'тестовая причина',
    });
  });

  it('encryptSchemaFrom: enc → strings, encJson → jsonArrays, plain — никуда', () => {
    const policy: FieldPolicy = { a: enc, b: encJson, c: plain('причина') };

    expect(encryptSchemaFrom(policy)).toEqual({
      strings: ['a'],
      jsonArrays: ['b'],
    });
  });

  it('пустая политика — пустые списки', () => {
    expect(encryptSchemaFrom({})).toEqual({ strings: [], jsonArrays: [] });
  });
});
