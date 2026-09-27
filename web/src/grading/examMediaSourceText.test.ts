import { describe, expect, it } from 'vitest';
import type { ExamMediaDto } from '@xuanxue/shared';
import { describeMediaSource } from './examMediaSourceText';

function makeMedia(overrides: Partial<ExamMediaDto> = {}): ExamMediaDto {
  return {
    id: 'm1',
    attemptId: 'a1',
    kind: 'telegram',
    receivedAt: '2026-09-12T00:00:00Z',
    ...overrides,
  };
}

describe('describeMediaSource', () => {
  // Не «видео смотрите там же»: пересылка при получении уходила не всем
  // (AttemptReviewMediaItem.test.tsx) — куда идти дальше, говорит уже
  // карточка, не эта строка.
  it('telegram — факт способа, без обещания, что видео уже в чате', () => {
    expect(describeMediaSource(makeMedia({ kind: 'telegram' }))).toBe(
      'Прислано сообщением боту в Telegram.',
    );
  });

  it('manual с подписью — подпись видна', () => {
    expect(
      describeMediaSource(
        makeMedia({ kind: 'manual', note: 'Прислал в личку ВКонтакте' }),
      ),
    ).toBe('Отмечено вручную: Прислал в личку ВКонтакте');
  });

  it('manual без подписи — честная заглушка', () => {
    expect(describeMediaSource(makeMedia({ kind: 'manual' }))).toBe(
      'Отмечено вручную, без подписи.',
    );
  });

  it('link — пустая строка, ссылку рисует сам компонент', () => {
    expect(
      describeMediaSource(makeMedia({ kind: 'link', url: 'https://example.com/v' })),
    ).toBe('');
  });

  it('file с размером — факт и размер (ADR-0137)', () => {
    expect(
      describeMediaSource(
        makeMedia({ kind: 'file', answerVideoId: 'v1', sizeBytes: 2 * 1024 * 1024 }),
      ),
    ).toBe('Загружено в кабинет, 2,0 МБ.');
  });

  it('file без размера — честный текст без числа', () => {
    expect(describeMediaSource(makeMedia({ kind: 'file', answerVideoId: 'v1' }))).toBe(
      'Загружено в кабинет.',
    );
  });
});
