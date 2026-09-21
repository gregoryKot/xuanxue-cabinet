// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая логика»).
import {
  EXAM_IMAGE_EMPTY_MESSAGE,
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_TOO_LARGE_MESSAGE,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { parseExamImageUpload } from './exam-image-upload';

function jpegOfSize(size: number): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(size - 3)]);
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GARBAGE = Buffer.from('это просто текст, не картинка', 'utf8');

// Сигнатуры проверяются там, где живут, — common/raw-upload.spec.ts. Здесь
// остаётся своя часть картинки варианта: лимит, тексты и границы.
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
