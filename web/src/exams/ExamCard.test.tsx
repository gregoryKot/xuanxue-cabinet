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
    rubric: [],
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ExamCard', () => {
  it('показывает название, статус и содержимое формы', () => {
    render(<ExamCard exam={makeExam()} onSelect={vi.fn()} />);

    expect(screen.getByText('Итоговый экзамен')).toBeInTheDocument();
    expect(screen.getByText(/Черновик · Пока без блоков/)).toBeInTheDocument();
  });

  it('без уровня — уровень в мете не показан', () => {
    render(<ExamCard exam={makeExam({ level: '' })} onSelect={vi.fn()} />);

    expect(screen.queryByText(/^начальный/)).not.toBeInTheDocument();
  });

  it('с уровнем — уровень идёт первым в мете', () => {
    render(<ExamCard exam={makeExam({ level: 'начальный' })} onSelect={vi.fn()} />);

    expect(screen.getByText(/начальный · Черновик/)).toBeInTheDocument();
  });

  it('блоки с вопросами — их число показано', () => {
    render(
      <ExamCard
        exam={makeExam({
          blocks: [
            {
              id: 'b1',
              title: '',
              itemIds: ['i1', 'i2'],
              shuffle: false,
              required: false,
            },
          ],
        })}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 блок · 2 вопроса/)).toBeInTheDocument();
  });

  it('без лимита времени — метка лимита не показана', () => {
    render(<ExamCard exam={makeExam({ timeLimitMin: undefined })} onSelect={vi.fn()} />);

    expect(screen.queryByText(/лимит/)).not.toBeInTheDocument();
  });

  it('с лимитом времени — минуты через общий форматтер', () => {
    render(<ExamCard exam={makeExam({ timeLimitMin: 45 })} onSelect={vi.fn()} />);

    expect(screen.getByText(/лимит 45 минут/)).toBeInTheDocument();
  });

  it('клик вызывает onSelect', async () => {
    const onSelect = vi.fn();
    render(<ExamCard exam={makeExam()} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
