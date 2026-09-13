// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты»): toExamMediaDto никогда
// не отдаёт fileId/fileUniqueId и скрывает поля не своего kind.
import { Types } from 'mongoose';
import type { RawLeanMediaAsset } from './media-asset.mapper';
import { toExamMediaDto } from './media-asset.mapper';

function baseDoc(overrides: Partial<RawLeanMediaAsset> = {}): RawLeanMediaAsset {
  return {
    _id: new Types.ObjectId(),
    attemptId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    kind: 'telegram',
    receivedAt: new Date('2026-09-12T10:00:00.000Z'),
    createdAt: new Date('2026-09-12T10:00:00.000Z'),
    updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    ...overrides,
  };
}

describe('toExamMediaDto', () => {
  it('kind telegram — durationSec/sizeBytes есть, url нет; fileId/fileUniqueId не попадают в DTO', () => {
    const dto = toExamMediaDto(
      baseDoc({
        kind: 'telegram',
        fileId: 'secret-file-id',
        fileUniqueId: 'secret-unique-id',
        durationSec: 220,
        sizeBytes: 12_000_000,
      }),
    );

    expect(dto.durationSec).toBe(220);
    expect(dto.sizeBytes).toBe(12_000_000);
    expect(dto.url).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain('secret-file-id');
    expect(JSON.stringify(dto)).not.toContain('secret-unique-id');
  });

  it('kind link — url есть, durationSec/sizeBytes нет', () => {
    const dto = toExamMediaDto(
      baseDoc({
        kind: 'link',
        url: 'https://vk.com/video-1',
        durationSec: 5,
        sizeBytes: 1,
      }),
    );

    expect(dto.url).toBe('https://vk.com/video-1');
    expect(dto.durationSec).toBeUndefined();
    expect(dto.sizeBytes).toBeUndefined();
  });

  it('kind manual — только note, ни url ни длительность/размер', () => {
    const dto = toExamMediaDto(baseDoc({ kind: 'manual', note: 'Прислал в WhatsApp' }));

    expect(dto.note).toBe('Прислал в WhatsApp');
    expect(dto.url).toBeUndefined();
    expect(dto.durationSec).toBeUndefined();
  });

  it('receivedAt — ISO UTC с Z', () => {
    const dto = toExamMediaDto(baseDoc());
    expect(dto.receivedAt).toBe('2026-09-12T10:00:00.000Z');
  });
});
