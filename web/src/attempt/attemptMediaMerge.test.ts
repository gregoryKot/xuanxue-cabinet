import { describe, expect, it } from 'vitest';
import type { ExamMediaDto } from '@xuanxue/shared';
import { mergeAnswerVideoMedia } from './attemptMediaMerge';

function makeMedia(overrides: Partial<ExamMediaDto> = {}): ExamMediaDto {
  return {
    id: 'm1',
    attemptId: 'a1',
    itemId: 'q1',
    kind: 'file',
    receivedAt: '2026-09-27T10:00:00.000Z',
    ...overrides,
  };
}

describe('mergeAnswerVideoMedia', () => {
  it('добавляет запись к пустому списку', () => {
    const next = makeMedia();
    expect(mergeAnswerVideoMedia([], next)).toEqual([next]);
  });

  it('заменяет прежний файл того же вопроса', () => {
    const old = makeMedia({ id: 'old', answerVideoId: 'v1' });
    const next = makeMedia({ id: 'new', answerVideoId: 'v2' });

    expect(mergeAnswerVideoMedia([old], next)).toEqual([next]);
  });

  it('не трогает ссылку и telegram-видео того же вопроса', () => {
    const link = makeMedia({ id: 'link', kind: 'link', url: 'https://x' });
    const telegram = makeMedia({ id: 'tg', kind: 'telegram' });
    const next = makeMedia({ id: 'file1' });

    const result = mergeAnswerVideoMedia([link, telegram], next);

    expect(result).toEqual([link, telegram, next]);
  });

  it('не трогает файл другого вопроса', () => {
    const other = makeMedia({ id: 'other', itemId: 'q2' });
    const next = makeMedia({ id: 'file1', itemId: 'q1' });

    expect(mergeAnswerVideoMedia([other], next)).toEqual([other, next]);
  });
});
