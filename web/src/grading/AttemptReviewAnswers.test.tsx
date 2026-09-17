import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import { AttemptReviewAnswers } from './AttemptReviewAnswers';
import type { AttemptReviewVideoControls } from './useAttemptReview';

const BLOCKS: AttemptReviewBlockDto[] = [
  {
    id: 'b1',
    title: 'Теория',
    questions: [{ itemId: 'q1', kind: 'text', prompt: 'Опишите дыхание', options: [] }],
  },
];

function makeVideo(
  overrides: Partial<AttemptReviewVideoControls> = {},
): AttemptReviewVideoControls {
  return {
    media: [],
    markMediaManual: () => Promise.resolve(true),
    markMediaStateFor: () => ({ pending: false, error: null }),
    ...overrides,
  };
}

describe('AttemptReviewAnswers', () => {
  it('заголовок, счётчик вопросов и вопросы блока — на экране; без видео блока видео нет вовсе', () => {
    render(<AttemptReviewAnswers blocks={BLOCKS} video={makeVideo()} />);

    expect(screen.getByRole('heading', { name: 'Ответы' })).toBeInTheDocument();
    expect(screen.getByText('1 вопрос · все проверяете вы')).toBeInTheDocument();
    expect(screen.getByText(/Опишите дыхание/)).toBeInTheDocument();
    // Блок без видео-вопросов и без «бесхозного» видео — блока «Видео» нет
    // вовсе (он переехал внутрь карточки видео-вопроса, ADR-0037).
    expect(screen.queryByText('Видео пока не получено.')).not.toBeInTheDocument();
  });

  it('видео без itemId (деплой на стыке версий, ADR-0037) — отдельный блок «Видео без вопроса»', () => {
    render(
      <AttemptReviewAnswers
        blocks={BLOCKS}
        video={makeVideo({
          media: [
            {
              id: 'm1',
              attemptId: 'a1',
              kind: 'manual',
              note: 'Прислал в WhatsApp',
              receivedAt: '2026-09-12T00:00:00Z',
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Видео без вопроса' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Отмечено вручную: Прислал в WhatsApp')).toBeInTheDocument();
  });
});
