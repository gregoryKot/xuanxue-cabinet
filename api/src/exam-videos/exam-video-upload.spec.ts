// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая
// логика») — тот же образец, что exam-image-upload.spec.ts.
import {
  EXAM_VIDEO_EMPTY_MESSAGE,
  EXAM_VIDEO_LIMITS,
  EXAM_VIDEO_TOO_LARGE_MESSAGE,
  EXAM_VIDEO_UNSUPPORTED_MESSAGE,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { parseExamVideoUpload } from './exam-video-upload';

function mp4OfSize(size: number): Buffer {
  const header = Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
  ]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, size - header.length))]);
}

const MP4 = mp4OfSize(64);
const GARBAGE = Buffer.from('это просто текст, не видео', 'utf8');

// Сигнатуры проверяются там, где живут — common/raw-upload.spec.ts. Здесь
// остаётся своя часть видео: лимит, тексты и границы.
describe('parseExamVideoUpload', () => {
  it('MP4 — распознанные bytes и contentType', () => {
    expect(parseExamVideoUpload(MP4)).toEqual({
      bytes: MP4,
      contentType: 'video/mp4',
    });
  });

  it.each([
    ['пустой Buffer', Buffer.alloc(0)],
    ['undefined', undefined],
    ['не Buffer (объект)', {}],
  ])('%s — EMPTY', (_label, body) => {
    expect(() => parseExamVideoUpload(body)).toThrow(InvalidInputError);
    expect(() => parseExamVideoUpload(body)).toThrow(EXAM_VIDEO_EMPTY_MESSAGE);
  });

  it('мусорные байты — UNSUPPORTED', () => {
    expect(() => parseExamVideoUpload(GARBAGE)).toThrow(EXAM_VIDEO_UNSUPPORTED_MESSAGE);
  });

  it('длина maxBytes + 1 с валидной сигнатурой — TOO_LARGE', () => {
    const oversized = mp4OfSize(EXAM_VIDEO_LIMITS.maxBytes + 1);
    expect(() => parseExamVideoUpload(oversized)).toThrow(EXAM_VIDEO_TOO_LARGE_MESSAGE);
  });

  it('длина ровно maxBytes с валидной сигнатурой — проходит', () => {
    const atLimit = mp4OfSize(EXAM_VIDEO_LIMITS.maxBytes);
    expect(parseExamVideoUpload(atLimit).contentType).toBe('video/mp4');
  });
});
