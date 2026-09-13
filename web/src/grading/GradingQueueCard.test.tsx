import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { GradingQueueCard } from './GradingQueueCard';

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    userName: 'Иван Иванов',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    submittedAt: '2026-09-01T01:00:00Z',
    expired: false,
    ...overrides,
  };
}

describe('GradingQueueCard', () => {
  it('показывает имя ученика, экзамен и когда сдана', () => {
    render(<GradingQueueCard attempt={makeAttempt()} onSelect={vi.fn()} />);

    expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
    expect(screen.getByText(/Форма первого уровня/)).toBeInTheDocument();
    expect(screen.getByText(/сдано/)).toBeInTheDocument();
  });

  it('аккаунт ученика удалён (userName не пришёл) — честная заглушка', () => {
    render(
      <GradingQueueCard
        attempt={makeAttempt({ userName: undefined })}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Аккаунт удалён')).toBeInTheDocument();
  });

  it('без даты сдачи — мета без «сдано»', () => {
    render(
      <GradingQueueCard
        attempt={makeAttempt({ submittedAt: undefined })}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText(/сдано/)).not.toBeInTheDocument();
  });

  it('сдано в срок — без пометки «по времени»', () => {
    render(
      <GradingQueueCard attempt={makeAttempt({ expired: false })} onSelect={vi.fn()} />,
    );

    expect(screen.queryByText(/по времени/)).not.toBeInTheDocument();
  });

  it('сдано по времени — пометка на карточке', () => {
    render(
      <GradingQueueCard attempt={makeAttempt({ expired: true })} onSelect={vi.fn()} />,
    );

    expect(screen.getByText(/сдано по времени/)).toBeInTheDocument();
  });

  it('клик вызывает onSelect', async () => {
    const onSelect = vi.fn();
    render(<GradingQueueCard attempt={makeAttempt()} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
