// Содержимое раскрытого вопроса (отзыв владельца 2026-09-27: «нельзя даже
// посмотреть, какие там варианты»): отметка верного, пометка картинки/видео
// у варианта и у вопроса, пустой текст варианта и тип ответа без вариантов.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamQuestionDetails } from './ExamQuestionDetails';

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'single',
    prompt: 'Какая форма длиннее?',
    options: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ExamQuestionDetails', () => {
  it('вариант с картинкой, с видео и без текста — пометки и прочерк', () => {
    render(
      <ExamQuestionDetails
        item={makeItem({
          options: [
            { id: 'o1', text: 'Первая', correct: true, imageId: 'img1' },
            { id: 'o2', text: 'Вторая', correct: false, videoUrl: 'https://youtu.be/x' },
            { id: 'o3', text: '  ', correct: false, videoId: 'v1' },
          ],
        })}
      />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('✓Первая · картинка');
    expect(rows[1]).toHaveTextContent('Вторая · видео');
    expect(rows[1]).not.toHaveTextContent('✓');
    expect(rows[2]).toHaveTextContent('— · видео');
  });

  it('у вопроса есть видео — строка об этом над вариантами', () => {
    render(<ExamQuestionDetails item={makeItem({ videoId: 'v1' })} />);

    expect(screen.getByText('У вопроса есть видео.')).toBeInTheDocument();
  });

  it('свободный ответ — вместо вариантов тип ответа', () => {
    render(<ExamQuestionDetails item={makeItem({ kind: 'text' })} />);

    expect(screen.getByText('Свободный ответ')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('У вопроса есть видео.')).not.toBeInTheDocument();
  });

  // ADR-0146.
  it('askReason включён — строка «Просит объяснение выбора»', () => {
    render(<ExamQuestionDetails item={makeItem({ askReason: true })} />);

    expect(screen.getByText('Просит объяснение выбора.')).toBeInTheDocument();
  });

  it('askReason выключен — строки нет', () => {
    render(<ExamQuestionDetails item={makeItem()} />);

    expect(screen.queryByText(/Просит объяснение/)).not.toBeInTheDocument();
  });
});
