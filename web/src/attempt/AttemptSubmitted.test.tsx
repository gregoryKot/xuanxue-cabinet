import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { AttemptSubmitted } from './AttemptSubmitted';

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
    ...overrides,
  };
}

function renderSubmitted(attempt: ExamAttemptDto) {
  return render(
    <MemoryRouter>
      <AttemptSubmitted
        attempt={attempt}
        telegramLinked
        onAddMediaLink={vi.fn().mockResolvedValue(true)}
        addingMediaLink={false}
        addMediaLinkError={null}
      />
    </MemoryRouter>,
  );
}

describe('AttemptSubmitted', () => {
  it('отправлено самим учеником — что будет дальше', () => {
    renderSubmitted(makeAttempt());

    expect(
      screen.getByText('Отправлено. Учитель проверит и пришлёт результат.'),
    ).toBeInTheDocument();
  });

  it('закрыто временем — отдельная честная строка', () => {
    renderSubmitted(makeAttempt({ expired: true }));

    expect(
      screen.getByText('Время вышло, попытка закрыта и отправлена на проверку.'),
    ).toBeInTheDocument();
  });

  it('проверено — без баллов и комментариев (слой 4.6/4.7 ещё не построен)', () => {
    renderSubmitted(makeAttempt({ status: 'graded' }));

    expect(screen.getByText('Экзамен проверен.')).toBeInTheDocument();
  });

  it('ссылка возврата к экзаменам', () => {
    renderSubmitted(makeAttempt());

    expect(screen.getByRole('link', { name: 'Вернуться к экзаменам' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
