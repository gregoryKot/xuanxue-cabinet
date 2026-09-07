import {
  isDuplicateKeyBulkError,
  isDuplicateKeyError,
  MONGO_DUPLICATE_KEY_CODE,
} from './mongo-error-codes';

describe('isDuplicateKeyError', () => {
  it('узнаёт E11000 по коду драйвера', () => {
    expect(isDuplicateKeyError({ code: MONGO_DUPLICATE_KEY_CODE })).toBe(true);
  });

  it('прочие ошибки и не-объекты — нет', () => {
    expect(isDuplicateKeyError({ code: 121 })).toBe(false);
    expect(isDuplicateKeyError(new Error('x'))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError('E11000')).toBe(false);
  });
});

describe('isDuplicateKeyBulkError', () => {
  it('единственная ошибка без writeErrors — по верхнеуровневому коду', () => {
    expect(isDuplicateKeyBulkError({ code: MONGO_DUPLICATE_KEY_CODE })).toBe(true);
    expect(isDuplicateKeyBulkError({ code: 121 })).toBe(false);
  });

  it('несколько writeErrors, все E11000 — дубли', () => {
    expect(
      isDuplicateKeyBulkError({
        writeErrors: [
          { code: MONGO_DUPLICATE_KEY_CODE },
          { code: MONGO_DUPLICATE_KEY_CODE },
        ],
      }),
    ).toBe(true);
  });

  it('writeErrors с кодом во вложенном err (реальная форма MongoBulkWriteError) — дубли', () => {
    expect(
      isDuplicateKeyBulkError({
        writeErrors: [
          { err: { code: MONGO_DUPLICATE_KEY_CODE, index: 0 }, index: 0 },
          { err: { code: MONGO_DUPLICATE_KEY_CODE, index: 1 }, index: 1 },
        ],
      }),
    ).toBe(true);
  });

  it('вложенный err с другим кодом — наверх', () => {
    expect(
      isDuplicateKeyBulkError({
        writeErrors: [{ err: { code: 121, index: 0 }, index: 0 }],
      }),
    ).toBe(false);
  });

  it('хотя бы одна writeError не E11000 — наверх', () => {
    expect(
      isDuplicateKeyBulkError({
        writeErrors: [{ code: MONGO_DUPLICATE_KEY_CODE }, { code: 121 }],
      }),
    ).toBe(false);
  });

  it('не-объекты — нет', () => {
    expect(isDuplicateKeyBulkError(null)).toBe(false);
    expect(isDuplicateKeyBulkError('E11000')).toBe(false);
  });

  it('элемент writeErrors не объект — не дубль, а неизвестная ошибка наверх', () => {
    expect(isDuplicateKeyBulkError({ writeErrors: [42] })).toBe(false);
    expect(isDuplicateKeyBulkError({ writeErrors: [null] })).toBe(false);
  });
});
