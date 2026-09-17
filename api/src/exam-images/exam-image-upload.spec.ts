// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая логика»).
import {
  EXAM_IMAGE_EMPTY_MESSAGE,
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_TOO_LARGE_MESSAGE,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { parseExamImageUpload, sniffExamImageType } from './exam-image-upload';

function jpegOfSize(size: number): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(size - 3)]);
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
]);
const GARBAGE = Buffer.from('это просто текст, не картинка', 'utf8');

describe('sniffExamImageType', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WebP', WEBP, 'image/webp'],
  ] as const)('сигнатура %s → свой тип', (_label, bytes, expected) => {
    expect(sniffExamImageType(bytes)).toBe(expected);
  });

  it('мусор — null', () => {
    expect(sniffExamImageType(GARBAGE)).toBeNull();
  });

  it('обрезанная сигнатура (короче эталона) — null, не падает', () => {
    expect(sniffExamImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('parseExamImageUpload', () => {
  it('JPEG — распознанные bytes и contentType', () => {
    expect(parseExamImageUpload(JPEG)).toEqual({
      bytes: JPEG,
      contentType: 'image/jpeg',
    });
  });

  it.each([
    ['пустой Buffer', Buffer.alloc(0)],
    ['undefined', undefined],
    ['не Buffer (объект)', {}],
  ])('%s — EMPTY', (_label, body) => {
    expect(() => parseExamImageUpload(body)).toThrow(InvalidInputError);
    expect(() => parseExamImageUpload(body)).toThrow(EXAM_IMAGE_EMPTY_MESSAGE);
  });

  it('мусорные байты (не Buffer, а строка иного формата) — UNSUPPORTED', () => {
    expect(() => parseExamImageUpload(GARBAGE)).toThrow(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  });

  it('длина maxBytes + 1 с валидной сигнатурой — TOO_LARGE', () => {
    const oversized = jpegOfSize(EXAM_IMAGE_LIMITS.maxBytes + 1);
    expect(() => parseExamImageUpload(oversized)).toThrow(EXAM_IMAGE_TOO_LARGE_MESSAGE);
  });

  it('длина ровно maxBytes с валидной сигнатурой — проходит', () => {
    const atLimit = jpegOfSize(EXAM_IMAGE_LIMITS.maxBytes);
    expect(parseExamImageUpload(atLimit).contentType).toBe('image/jpeg');
  });
});
