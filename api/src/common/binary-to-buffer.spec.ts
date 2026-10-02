// Чистая логика без Mongo (CLAUDE.md «Тесты»): три формы, в которых байты
// приходят из драйвера, и отказ на всём остальном.
import { mongo } from 'mongoose';
import { binaryToBuffer } from './binary-to-buffer';

describe('binaryToBuffer', () => {
  it('Buffer отдаёт как есть', () => {
    const bytes = Buffer.from([1, 2, 3]);

    expect(binaryToBuffer(bytes)).toBe(bytes);
  });

  it('голый Uint8Array превращает в Buffer с теми же байтами', () => {
    const result = binaryToBuffer(new Uint8Array([4, 5]));

    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([4, 5]);
  });

  it('Binary из .lean() — Buffer с теми же байтами', () => {
    const result = binaryToBuffer(new mongo.Binary(Buffer.from([7, 8, 9])));

    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([7, 8, 9]);
  });

  it.each([
    ['строка', 'bytes'],
    ['число', 5],
    ['пустой объект', {}],
    ['null', null],
  ])('%s — ошибка, а не пустой Buffer', (_name, value) => {
    expect(() => binaryToBuffer(value)).toThrow('неизвестный формат');
  });
});
