import { isDuplicateKeyError, MONGO_DUPLICATE_KEY_CODE } from './mongo-error-codes';

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
