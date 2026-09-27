// Чистая логика — без Mongo (CLAUDE.md «Тесты»): видео вопроса, файл или
// ссылка, не оба разом (ADR-0133).
import { ITEM_ONE_VIDEO_SOURCE_MESSAGE } from '@xuanxue/shared';
import { assertOneVideoSource, collectItemVideoIds } from './exam-item-video';
import type { ExamItemOptionRecord, ExamItemVersionRecord } from './exam-item.schema';

describe('assertOneVideoSource', () => {
  it('ни файла, ни ссылки — проходит', () => {
    expect(() => assertOneVideoSource(undefined, undefined)).not.toThrow();
  });

  it('только файл — проходит', () => {
    expect(() => assertOneVideoSource('vid1', undefined)).not.toThrow();
  });

  it('только ссылка — проходит', () => {
    expect(() => assertOneVideoSource(undefined, 'https://youtu.be/x')).not.toThrow();
  });

  it('файл и ссылка разом — ITEM_ONE_VIDEO_SOURCE_MESSAGE', () => {
    expect(() => assertOneVideoSource('vid1', 'https://youtu.be/x')).toThrow(
      ITEM_ONE_VIDEO_SOURCE_MESSAGE,
    );
  });
});

describe('collectItemVideoIds', () => {
  const historyEntry = (
    videoId: string | undefined,
    options: ExamItemOptionRecord[],
  ): ExamItemVersionRecord => ({
    version: 1,
    prompt: 'p',
    ...(videoId !== undefined ? { videoId } : {}),
    options,
    replacedAt: '2026-09-12T10:00:00.000Z',
  });

  it('нигде нет видео — пустой список', () => {
    const options: ExamItemOptionRecord[] = [{ id: 'o1', text: 'A', correct: true }];
    expect(collectItemVideoIds(undefined, options, [])).toEqual([]);
  });

  it('только видео вопроса — попадает в список', () => {
    const options: ExamItemOptionRecord[] = [{ id: 'o1', text: 'A', correct: true }];
    expect(collectItemVideoIds('item-video', options, [])).toEqual(['item-video']);
  });

  it('видео вопроса, вариантов и истории — все разом, без повторов', () => {
    const options: ExamItemOptionRecord[] = [
      { id: 'o1', text: '', correct: true, videoId: 'opt-video' },
    ];
    const history = [historyEntry('old-item-video', [])];

    expect(collectItemVideoIds('item-video', options, history)).toEqual(
      expect.arrayContaining(['item-video', 'opt-video', 'old-item-video']),
    );
    expect(collectItemVideoIds('item-video', options, history)).toHaveLength(3);
  });
});
