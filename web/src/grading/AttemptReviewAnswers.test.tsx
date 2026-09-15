import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import { AttemptReviewAnswers } from './AttemptReviewAnswers';

const BLOCKS: AttemptReviewBlockDto[] = [
  {
    id: 'b1',
    title: 'Теория',
    questions: [{ itemId: 'q1', kind: 'text', prompt: 'Опишите дыхание', options: [] }],
  },
];

describe('AttemptReviewAnswers', () => {
  it('заголовок, счётчик вопросов, видео и вопросы блока — всё на экране', () => {
    render(
      <AttemptReviewAnswers
        blocks={BLOCKS}
        media={[]}
        onMarkManual={vi.fn().mockResolvedValue(true)}
        markingMedia={false}
        markMediaError={null}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ответы' })).toBeInTheDocument();
    expect(screen.getByText('1 вопрос · все проверяете вы')).toBeInTheDocument();
    expect(screen.getByText('Видео пока не получено.')).toBeInTheDocument();
    expect(screen.getByText(/Опишите дыхание/)).toBeInTheDocument();
  });
});
