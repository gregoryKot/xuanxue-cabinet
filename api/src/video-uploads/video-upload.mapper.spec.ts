// Чистая логика, без Mongo (CLAUDE.md «Тесты»).
import { Types } from 'mongoose';
import { ANSWER_VIDEO_LIMITS } from '@xuanxue/shared';
import {
  partCountFor,
  toVideoUploadDto,
  type RawLeanVideoUpload,
} from './video-upload.mapper';

function video(overrides: Partial<RawLeanVideoUpload> = {}): RawLeanVideoUpload {
  return {
    _id: new Types.ObjectId(),
    key: 'answer-videos/x',
    sizeBytes: 100,
    fingerprint: '100:1',
    status: 'uploading',
    parts: [],
    createdAt: new Date('2026-09-27T10:00:00Z'),
    updatedAt: new Date('2026-09-27T10:00:00Z'),
    ...overrides,
  };
}

describe('partCountFor', () => {
  it('ровно кратно частям', () => {
    expect(partCountFor(ANSWER_VIDEO_LIMITS.partBytes * 2)).toBe(2);
  });

  it('с хвостом — округляется вверх', () => {
    expect(partCountFor(ANSWER_VIDEO_LIMITS.partBytes + 1)).toBe(2);
  });

  it('меньше одной части — всё равно одна', () => {
    expect(partCountFor(10)).toBe(1);
  });
});

describe('toVideoUploadDto', () => {
  it('receivedParts — отсортированные номера частей, без key/uploadId', () => {
    const dto = toVideoUploadDto(
      video({
        parts: [
          { n: 3, etag: '"c"' },
          { n: 1, etag: '"a"' },
        ],
      }),
    );

    expect(dto.receivedParts).toEqual([1, 3]);
    expect(dto).not.toHaveProperty('key');
    expect(dto).not.toHaveProperty('uploadId');
    expect(dto.partBytes).toBe(ANSWER_VIDEO_LIMITS.partBytes);
  });
});
