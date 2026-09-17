import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamDto } from '@xuanxue/shared';
import { ExamCard } from './ExamCard';

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Итоговый экзамен',
    description: '',
    level: '',
    blocks: [],
    shuffleOptions: false,
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ExamCard', () => {
  it('показывает название, метаданные и статус отдельной меткой', () => {
    render(<ExamCard exam={makeExam()} onSelect={vi.fn()} />);

    expect(screen.getByText('Итоговый экзамен')).toBeInTheDocument();
    expect(
      screen.getByText('Пока без вопросов · 1 попытка · без ограничения'),
    ).toBeInTheDocument();
    expect(screen.getByText('Черновик')).toBeInTheDocument();
  });

  it('опубликованная форма — статус «Опубликован»', () => {
    render(<ExamCard exam={makeExam({ status: 'published' })} onSelect={vi.fn()} />);

    expect(screen.getByText('Опубликован')).toBeInTheDocument();
  });

  it('вопросы экзамена — их число в строке метаданных, без слова «блок»', () => {
    render(
      <ExamCard
        exam={makeExam({
          blocks: [
            {
              id: 'b1',
              title: '',
              itemIds: ['i1', 'i2'],
              shuffle: false,
            },
          ],
        })}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/^2 вопроса · 1 попытка/)).toBeInTheDocument();
  });

  it('с лимитом времени — минуты через общий форматтер', () => {
    render(<ExamCard exam={makeExam({ timeLimitMin: 45 })} onSelect={vi.fn()} />);

    expect(screen.getByText(/45 минут/)).toBeInTheDocument();
  });

  it('клик вызывает onSelect', async () => {
    const onSelect = vi.fn();
    render(<ExamCard exam={makeExam()} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
