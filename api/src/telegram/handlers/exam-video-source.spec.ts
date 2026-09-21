// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type { Message } from 'telegraf/types';
import { extractExamVideoSource } from './exam-video-source';

describe('extractExamVideoSource', () => {
  it('видео — fileId/fileUniqueId/durationSec/sizeBytes, telegramType: video', () => {
    const message = {
      video: { file_id: 'v1', file_unique_id: 'vu1', duration: 62, file_size: 5_000_000 },
    } as unknown as Message;

    expect(extractExamVideoSource(message)).toEqual({
      fileId: 'v1',
      fileUniqueId: 'vu1',
      telegramType: 'video',
      durationSec: 62,
      sizeBytes: 5_000_000,
    });
  });

  it('«кружок» (video_note) — тот же набор полей, telegramType: video_note', () => {
    const message = {
      video_note: {
        file_id: 'n1',
        file_unique_id: 'nu1',
        duration: 15,
        file_size: 800_000,
      },
    } as unknown as Message;

    expect(extractExamVideoSource(message)).toEqual({
      fileId: 'n1',
      fileUniqueId: 'nu1',
      telegramType: 'video_note',
      durationSec: 15,
      sizeBytes: 800_000,
    });
  });

  it('документ с video/* — fileId/fileUniqueId/sizeBytes, без durationSec, telegramType: document', () => {
    const message = {
      document: {
        file_id: 'd1',
        file_unique_id: 'du1',
        mime_type: 'video/mp4',
        file_size: 9_000_000,
      },
    } as unknown as Message;

    expect(extractExamVideoSource(message)).toEqual({
      fileId: 'd1',
      fileUniqueId: 'du1',
      telegramType: 'document',
      durationSec: undefined,
      sizeBytes: 9_000_000,
    });
  });

  it('документ не video/* — null', () => {
    const message = {
      document: { file_id: 'd2', file_unique_id: 'du2', mime_type: 'application/pdf' },
    } as unknown as Message;

    expect(extractExamVideoSource(message)).toBeNull();
  });

  it('документ без mime_type — null', () => {
    const message = {
      document: { file_id: 'd3', file_unique_id: 'du3' },
    } as unknown as Message;
    expect(extractExamVideoSource(message)).toBeNull();
  });

  it('текст — null (не источник видео)', () => {
    expect(extractExamVideoSource({ text: 'привет' } as unknown as Message)).toBeNull();
  });

  it('стикер — null', () => {
    expect(
      extractExamVideoSource({ sticker: { file_id: 's1' } } as unknown as Message),
    ).toBeNull();
  });

  it('нет сообщения — null', () => {
    expect(extractExamVideoSource(undefined)).toBeNull();
  });
});
