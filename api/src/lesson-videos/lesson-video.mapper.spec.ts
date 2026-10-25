// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»): маппер записи видео в DTO.
import { Types } from 'mongoose';
import {
  isLessonVideoReady,
  toLessonVideoDto,
  type RawLeanLessonVideo,
} from './lesson-video.mapper';

function raw(overrides: Partial<RawLeanLessonVideo> = {}): RawLeanLessonVideo {
  return {
    _id: new Types.ObjectId(),
    key: 'lesson-videos/secret-key',
    contentType: 'video/mp4',
    sizeBytes: 123,
    fingerprint: 'fp',
    status: 'ready',
    parts: [],
    uploadId: 'upload-secret',
    createdAt: new Date('2026-10-10T10:00:00.000Z'),
    updatedAt: new Date('2026-10-10T11:00:00.000Z'),
    ...overrides,
  };
}

describe('toLessonVideoDto', () => {
  it('отдаёт id, тип, размер и дату UTC; ключ объекта и служебные поля не уходят', () => {
    const doc = raw();

    const dto = toLessonVideoDto(doc);

    expect(dto).toEqual({
      id: doc._id.toString(),
      contentType: 'video/mp4',
      sizeBytes: 123,
      createdAt: '2026-10-10T10:00:00.000Z',
    });
    expect(JSON.stringify(dto)).not.toMatch(/secret/);
  });

  it('готовое видео без типа — повреждённая запись: ошибка, а не выдуманный тип', () => {
    expect(() => toLessonVideoDto(raw({ contentType: undefined }))).toThrow(
      /нет contentType/,
    );
  });
});

describe('isLessonVideoReady', () => {
  it('готово только status ready', () => {
    expect(isLessonVideoReady({ status: 'ready' })).toBe(true);
    expect(isLessonVideoReady({ status: 'uploading' })).toBe(false);
  });
});
