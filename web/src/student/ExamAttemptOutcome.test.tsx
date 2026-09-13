import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GradingCriterionDto } from '@xuanxue/shared';
import { ExamAttemptOutcome } from './ExamAttemptOutcome';

const CRITERIA: GradingCriterionDto[] = [
  { id: 'c1', title: 'Устойчивость и центр', maxScore: 5, score: 4 },
  {
    id: 'c2',
    title: 'Плавность и дыхание',
    maxScore: 5,
    score: 3,
    comment: 'Спешите на выдохе',
  },
];

describe('ExamAttemptOutcome', () => {
  it('заголовок итога, баллы по критериям и комментарий к критерию', () => {
    render(<ExamAttemptOutcome outcome="passed" criteria={CRITERIA} />);

    expect(screen.getByText('Экзамен сдан')).toBeInTheDocument();
    expect(screen.getByText('Устойчивость и центр: 4 из 5')).toBeInTheDocument();
    expect(screen.getByText(/Плавность и дыхание: 3 из 5/)).toBeInTheDocument();
    expect(screen.getByText(/Спешите на выдохе/)).toBeInTheDocument();
  });

  it('общий комментарий учителя, если он есть', () => {
    render(
      <ExamAttemptOutcome
        outcome="needs_work"
        comment="Проверьте стойку в начале формы."
      />,
    );

    expect(screen.getByText('Нужно доработать')).toBeInTheDocument();
    expect(screen.getByText(/Проверьте стойку в начале формы\./)).toBeInTheDocument();
  });

  it('без критериев и без комментария — только итог, ничего лишнего', () => {
    render(<ExamAttemptOutcome outcome="failed" />);

    expect(screen.getByText('Экзамен не сдан')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(/Комментарий учителя/)).not.toBeInTheDocument();
  });

  it('пустой список критериев — тоже ничего не рисует', () => {
    render(<ExamAttemptOutcome outcome="passed" criteria={[]} />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
