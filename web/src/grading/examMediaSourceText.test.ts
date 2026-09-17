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
  it('telegram — куда идти смотреть', () => {
    expect(describeMediaSource(makeMedia({ kind: 'telegram' }))).toBe(
      'Переслано боту в Telegram. Видео смотрите там же.',
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
});
