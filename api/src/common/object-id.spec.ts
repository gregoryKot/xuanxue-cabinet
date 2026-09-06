import { Types } from 'mongoose';
import { assertObjectId } from './object-id';

const MESSAGE = 'Не найдено. Обновите список.';

describe('assertObjectId', () => {
  it('валидный ObjectId — не бросает', () => {
    expect(() => assertObjectId(new Types.ObjectId().toString(), MESSAGE)).not.toThrow();
  });

  it('невалидная строка — NotFoundError с переданным сообщением', () => {
    expect(() => assertObjectId('не-id', MESSAGE)).toThrow(MESSAGE);
  });

  it('пустая строка — NotFoundError', () => {
    expect(() => assertObjectId('', MESSAGE)).toThrow(MESSAGE);
  });
});
