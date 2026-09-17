import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExamAttemptOutcome } from './ExamAttemptOutcome';

describe('ExamAttemptOutcome', () => {
  it('заголовок итога «сдан» и комментарий учителя', () => {
    render(<ExamAttemptOutcome outcome="passed" comment="Держите темп чуть ровнее." />);

    expect(screen.getByText('Экзамен сдан')).toBeInTheDocument();
    expect(screen.getByText('Держите темп чуть ровнее.')).toBeInTheDocument();
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

  it('без комментария — только итог, ничего лишнего', () => {
    render(<ExamAttemptOutcome outcome="failed" />);

    expect(screen.getByText('Экзамен не сдан')).toBeInTheDocument();
    expect(screen.queryByText(/Комментарий учителя/)).not.toBeInTheDocument();
  });
});
